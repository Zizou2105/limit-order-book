from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
import logging
from order_book_logic import OrderBook, Order, Side, datetime
import os
import uvicorn
import asyncio
import random
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware


logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Global OrderBook Instance ---
logger.info("Creating global OrderBook instance...")
lob = OrderBook(history_limit=200)
logger.info("Global OrderBook instance created.")

# --- Simulator Logic ---
async def run_direct_lob_simulator():
     logger.info("Starting direct LOB simulator...")
     client_names = ["TraderA", "TraderB", "TraderC", "TraderD", "MMaker1"]
     while True:
        try:
            sleep_time = random.uniform(0.5, 3.0)
            await asyncio.sleep(sleep_time)

            side = random.choice([Side.BUY, Side.SELL])
            best_bid = lob.get_best_bid()
            best_ask = lob.get_best_ask()
            base_price = 100.0
            if best_bid is not None and best_ask is not None: base_price = (best_bid + best_ask) / 2.0
            elif best_ask is not None: base_price = best_ask - 0.5
            elif best_bid is not None: base_price = best_bid + 0.5
            price_offset = random.uniform(-1.5, 1.5)
            order_price = max(0.01, round(base_price + price_offset, 2)) # Ensure positive price
            order_volume = random.randint(5, 50)
            client_name = random.choice(client_names)

            logger.info(f"DirectSim placing: {client_name} {side.name} {order_volume}@{order_price:.2f}")
            lob.place_order(client_name, side, order_price, order_volume)

            if random.random() < 0.05 and lob.order_map:
                 order_id_to_cancel = random.choice(list(lob.order_map.keys()))
                 logger.info(f"DirectSim cancelling: {order_id_to_cancel}")
                 lob.cancel_order(order_id_to_cancel)

        except asyncio.CancelledError:
             logger.info("Direct LOB simulator task cancelled.")
             break
        except Exception as e:
            logger.error(f"Direct simulator error: {e}", exc_info=True)
            await asyncio.sleep(5)

# --- Lifespan Context Manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Application startup... starting background simulator.")
    simulator_task = asyncio.create_task(run_direct_lob_simulator())
    yield
    logger.info("Application shutdown... cancelling simulator task.")
    simulator_task.cancel()
    try:
        await simulator_task
    except asyncio.CancelledError:
        logger.info("Simulator task successfully cancelled.")
    logger.info("Lifespan shutdown complete.")


app = FastAPI(
    title="Order Book Simulator API",
    description="API to interact with a Limit Order Book simulation.",
    version="1.0.0"
)

origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "*"
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class OrderRequest(BaseModel):
    """Defines the expected JSON structure for placing an order."""
    client: str
    side: Side
    price: float
    volume: int

class PlaceOrderResponse(BaseModel):
    """Defines the response structure after placing an order."""
    message: str
    order_id: int | None = None
    trades_executed: list[str] = []

class CancelOrderResponse(BaseModel):
    """Defines the response structure after cancelling an order."""
    message: str
    order_id: int

class LobLevel(BaseModel):
    """Structure for a single price level in the snapshot."""
    price: float
    volume: int

class LobSnapshotResponse(BaseModel):
    """Defines the structure for the order book snapshot response."""
    bids: list[LobLevel]
    asks: list[LobLevel]

class PriceHistoryPoint(BaseModel):
    timestamp: float # JS timestamp (milliseconds)
    price: float

class PriceHistoryResponse(BaseModel):
    history: list[PriceHistoryPoint]

@app.get("/")
async def read_root():
    """Basic root endpoint to check if the API is running."""
    return {"message": "Welcome to the Order Book Simulator API!"}

@app.post("/order", response_model=PlaceOrderResponse, status_code=201)
async def create_order(order_request: OrderRequest):
    """
    Places a new limit order into the order book.
    Attempts to match the order against the existing book.
    Returns the order ID and any trades executed as a result of this placement.
    """
    logger.info(f"API Received order placement request: {order_request}")
    try:
        new_order_id, trades = lob.place_order(
            client=order_request.client,
            side=order_request.side,
            price=order_request.price,
            volume=order_request.volume
        )
        logger.info(f"Order {new_order_id} processed. Trades executed: {len(trades)}")
        return PlaceOrderResponse(
            message="Order received and processed.",
            order_id=new_order_id,
            trades_executed=trades
        )
    except Exception as e:
        logger.error(f"Error processing order {order_request}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error processing order.")
    

@app.delete("/order/{order_id}", response_model=CancelOrderResponse)
async def delete_order(order_id: int):
    """
    Attempts to cancel an existing order in the book using its ID.
    """
    logger.info(f"API Received cancel request for Order ID: {order_id}")
    try:
        success = lob.cancel_order(order_id)

        if success:
            logger.info(f"Order {order_id} cancellation processed successfully.")
            return CancelOrderResponse(message="Order cancelled successfully.", order_id=order_id)
        else:
            logger.warning(f"Order {order_id} not found or could not be cancelled.")
            raise HTTPException(status_code=404, detail=f"Order {order_id} not found or cannot be cancelled.")
    except Exception as e:
        logger.error(f"Error cancelling order {order_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error cancelling order.")

@app.get("/lob", response_model=LobSnapshotResponse)
async def get_lob_snapshot(levels: int = Query(5, ge=1, le=50, description="Number of price levels to display per side")):
    """
    Retrieves the current aggregated order book snapshot
    (top N levels for bids and asks).
    """
    try:
        snapshot = lob.get_order_book_snapshot(levels=levels)
        return LobSnapshotResponse(**snapshot)
    except Exception as e:
        logger.error(f"Error retrieving LOB snapshot: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error retrieving order book snapshot.")

@app.get("/price_history", response_model=PriceHistoryResponse)
async def get_price_history_data():
    """Retrieves the recent mid-price history from the simulator."""
    try:
        history_tuples = lob.price_history
        # Convert list of tuples to list of dictionaries/Pydantic models
        history_data = [{"timestamp": ts, "price": p} for ts, p in history_tuples]
        return PriceHistoryResponse(history=history_data)
    except Exception as e:
        logger.error(f"Error retrieving price history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error retrieving price history.")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    logger.info(f"Starting server on host 0.0.0.0 port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)