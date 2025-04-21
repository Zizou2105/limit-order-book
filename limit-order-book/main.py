from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
import logging
from order_book_logic import OrderBook, Order, Side, datetime
import os
import uvicorn
import asyncio
import random
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Annotated
import json


logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Global OrderBook Instance ---
logger.info("Creating global OrderBook instance...")
lob = OrderBook(history_limit=200)
logger.info("Global OrderBook instance created.")

# --- Simulator Control Event ---
logger.info("Creating simulator control event (initially inactive).")
simulator_active_event = asyncio.Event()
# simulator_active_event.set() # REMOVE: Start as inactive by default

# --- WebSocket Manager ---
class WebSocketManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        logger.info("WebSocketManager initialized")

    async def connect(self, websocket: WebSocket):
        try:
            await websocket.accept()
            self.active_connections.append(websocket)
            logger.info(f"New WebSocket connection accepted. Total connections: {len(self.active_connections)}")
            # Send initial welcome message and current order book state
            snapshot = lob.get_order_book_snapshot(levels=15)
            logger.info(f"Sending initial order book snapshot: {snapshot}")
            await websocket.send_json({
                "type": "connection_established",
                "message": "WebSocket connection established successfully",
                "initial_state": snapshot
            })
        except Exception as e:
            logger.error(f"Error accepting WebSocket connection: {e}", exc_info=True)
            raise

    def disconnect(self, websocket: WebSocket):
        try:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket connection removed. Remaining connections: {len(self.active_connections)}")
        except ValueError:
            logger.warning("Attempted to remove non-existent WebSocket connection")
        except Exception as e:
            logger.error(f"Error removing WebSocket connection: {e}", exc_info=True)

    async def broadcast(self, message: dict):
        if not self.active_connections:
            logger.debug("No active WebSocket connections to broadcast to")
            return

        logger.info(f"Broadcasting message to {len(self.active_connections)} connections: {message}")
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
                logger.debug(f"Successfully sent message to connection")
            except Exception as e:
                logger.error(f"Error broadcasting to WebSocket: {e}", exc_info=True)
                dead_connections.append(connection)

        for dead_connection in dead_connections:
            self.disconnect(dead_connection)

# Initialize WebSocket manager
ws_manager = WebSocketManager()

# --- Simple Order Generator ---
async def simple_order_generator():
    logger.info("SimpleGen TASK STARTED.")
    logger.info("Starting simple order generator...")
    order_counter = 1 # Simple way to ensure unique orders if needed by logic
    client_name = "AutoTrader"
    last_mid_price = 100.0 # Keep track of the last price
    while True:
        try:
            # --- Wait for activation signal --- 
            await simulator_active_event.wait() 
            logger.info("SimpleGen loop entered (Simulator Active).")
            # --- Short delay before generating --- 
            await asyncio.sleep(0.5) # Wait 0.5 seconds - FASTER
            logger.info("SimpleGen awake after sleep.")

            # --- Check again in case it was toggled off during sleep --- 
            if not simulator_active_event.is_set():
                logger.info("SimpleGen loop paused (toggled off during sleep).")
                continue # Go back to waiting for the event

            # --- Calculate Mid Price ---
            best_bid = lob.get_best_bid()
            best_ask = lob.get_best_ask()
            current_mid_price = last_mid_price
            if best_bid is not None and best_ask is not None:
                current_mid_price = (best_bid + best_ask) / 2.0
            elif best_bid is not None:
                 # If only bids, price slightly above best bid
                 current_mid_price = best_bid + 0.01 
            elif best_ask is not None:
                 # If only asks, price slightly below best ask
                 current_mid_price = best_ask - 0.01
            
            last_mid_price = current_mid_price # Update last known price
            # --- Generate Order --- 
            side = random.choice([Side.BUY, Side.SELL])
            # Normally distributed offset around 0
            price_offset = random.normalvariate(mu=0, sigma=0.25) 
            order_price = round(current_mid_price + price_offset, 2)
            # Ensure price is positive
            order_price = max(0.01, order_price) 

            order_volume = random.randint(5, 25) # Randomize volume slightly

            logger.info(f"SimpleGen placing: {client_name} {side.name} {order_volume}@{order_price:.2f} (Mid: {current_mid_price:.2f})")
            
            # Use the existing LOB logic to place the order and get trades
            order_id, trades = lob.place_order(client_name, side, order_price, order_volume)
            logger.info(f"SimpleGen Order {order_id} placed. Trades: {len(trades)}")

            # Broadcast the updated order book snapshot AND trades together
            snapshot = lob.get_order_book_snapshot(levels=15)
            broadcast_message = {
                "type": "order_book_update",
                "data": snapshot,
                "trades": trades if trades else [] # Ensure trades key is always present
            }
            # Fetch placed order details if ID exists
            placed_order = lob.order_map.get(order_id)
            if placed_order:
                 broadcast_message["placed_order_details"] = {
                    "order_id": placed_order.order_id,
                    "client": placed_order.client,
                    "side": placed_order.side.name, # Send side as string (BUY/SELL)
                    "price": placed_order.price,
                    "volume": placed_order.volume,
                    "timestamp": placed_order.timestamp.timestamp() * 1000 # JS Timestamp ms
                 }
                 logger.info(f"SimpleGen Including placed_order_details for {order_id} in broadcast.")
            else:
                 logger.warning(f"SimpleGen Could not find placed order {order_id} to include details in broadcast.")
            
            # No longer need the conditional add, just log if trades exist
            if trades:
                logger.info(f"SimpleGen Including {len(trades)} trades in broadcast.")
            
            await ws_manager.broadcast(broadcast_message)
            logger.info(f"SimpleGen Broadcasted order_book_update. Bids: {len(snapshot.get('bids',[]))}, Asks: {len(snapshot.get('asks',[]))}")


        except asyncio.CancelledError:
            logger.info("Simple order generator task cancelled.")
            break
        except Exception as e:
            logger.error(f"Simple order generator error: {e}", exc_info=True)
            await asyncio.sleep(5) # Wait before retrying on error


# --- API Models ---
class SimulatorStatus(BaseModel):
    active: bool

# --- Lifespan Context Manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Application startup... starting simple background generator.")
    # Start the NEW generator task
    generator_task = asyncio.create_task(simple_order_generator())
    logger.info(f"SimpleGen TASK CREATED: {generator_task}")
    logger.info("Lifespan: Before yield")
    yield
    logger.info("Lifespan: After yield")
    logger.info("Application shutdown... cancelling generator task.")
    generator_task.cancel()
    try:
        await generator_task
    except asyncio.CancelledError:
        logger.info("Generator task successfully cancelled.")
    logger.info("Lifespan shutdown complete.")


app = FastAPI(
    title="Order Book Simulator API",
    description="API to interact with a Limit Order Book simulation.",
    version="1.0.0",
    lifespan=lifespan
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

# NEW: Define a Pydantic model for a Trade in the response
class TradeResponse(BaseModel):
    timestamp: float
    price: float
    volume: int
    maker_order_id: int
    taker_order_id: int
    maker_client: str
    taker_client: str

class PlaceOrderResponse(BaseModel):
    """Defines the response structure after placing an order."""
    message: str
    order_id: int | None = None
    trades_executed: List[TradeResponse] = []

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

# --- API Endpoints ---

@app.get("/simulator/status", response_model=SimulatorStatus)
async def get_simulator_status():
    """Check if the automatic order generator is currently active."""
    is_active = simulator_active_event.is_set()
    logger.info(f"API GET /simulator/status - Returning active={is_active}")
    return SimulatorStatus(active=is_active)

@app.post("/simulator/toggle", response_model=SimulatorStatus)
async def toggle_simulator(status: SimulatorStatus):
    """Turn the automatic order generator on or off."""
    if status.active:
        logger.info("API POST /simulator/toggle - Setting simulator ACTIVE")
        simulator_active_event.set()
    else:
        logger.info("API POST /simulator/toggle - Setting simulator INACTIVE")
        simulator_active_event.clear()
    # Return the *actual* current status after the operation
    current_status = simulator_active_event.is_set()
    logger.info(f"API POST /simulator/toggle - Current status active={current_status}")
    return SimulatorStatus(active=current_status)

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
        
        # Get updated order book snapshot
        snapshot = lob.get_order_book_snapshot(levels=15)
        logger.info(f"Order book snapshot after order placement: {snapshot}")

        # --- Prepare broadcast data ---
        broadcast_data = {
            "type": "order_book_update",
            "data": snapshot,
            "trades": trades if trades else [] # Ensure trades key is always present
        }
        # Fetch placed order details if ID exists
        placed_order = lob.order_map.get(new_order_id)
        if placed_order:
            broadcast_data["placed_order_details"] = {
                "order_id": placed_order.order_id,
                "client": placed_order.client,
                "side": placed_order.side.name, # Send side as string (BUY/SELL)
                "price": placed_order.price,
                "volume": placed_order.volume,
                "timestamp": placed_order.timestamp.timestamp() * 1000 # JS Timestamp ms
            }
            logger.info(f"Including placed_order_details for {new_order_id} in broadcast.")
        else:
             logger.warning(f"Could not find placed order {new_order_id} to include details in broadcast.")
        
        # Broadcast order book update
        await ws_manager.broadcast(broadcast_data)
        
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
            # Get updated order book snapshot
            snapshot = lob.get_order_book_snapshot(levels=15)
            logger.info(f"Order book snapshot after cancellation: {snapshot}")
            
            # Broadcast order book update
            await ws_manager.broadcast({
                "type": "order_book_update",
                "data": snapshot,
                "cancelled_order_id": order_id
            })
            
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

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    logger.info("New WebSocket connection request received")
    try:
        await ws_manager.connect(websocket)
        logger.info("WebSocket connection established successfully")
        
        while True:
            try:
                # Receive and handle messages
                data = await websocket.receive_text()
                logger.debug(f"Received message: {data}")
                
                try:
                    message = json.loads(data)
                    if message.get("type") == "ping":
                        logger.debug("Received ping, sending pong")
                        await websocket.send_json({"type": "pong"})
                except json.JSONDecodeError:
                    logger.warning(f"Received non-JSON message: {data}")
                
            except WebSocketDisconnect:
                logger.info("WebSocket client disconnected")
                break
            except Exception as e:
                logger.error(f"Error in WebSocket connection: {e}", exc_info=True)
                break
    except Exception as e:
        logger.error(f"Error establishing WebSocket connection: {e}", exc_info=True)
    finally:
        ws_manager.disconnect(websocket)
        logger.info("WebSocket connection cleanup complete")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    logger.info(f"Starting server on host 0.0.0.0 port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)