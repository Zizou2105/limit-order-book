from enum import Enum, auto
import datetime
import heapq
from collections import deque
import logging
from typing import TypedDict, List

logging.basicConfig(level=logging.INFO, format='%(asctime)s - LGC - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class Side(Enum):
    BUY = auto()
    SELL = auto()

class Trade(TypedDict):
    timestamp: float # JS compatible timestamp (milliseconds)
    price: float
    volume: int
    maker_order_id: int
    taker_order_id: int
    maker_client: str
    taker_client: str

class Order:
    def __init__(self, order_id: int, client: str, side: Side, price: float, volume: int):
        self.order_id = order_id
        self.client = client
        self.side = side
        self.price = price
        self.volume = volume
        self.timestamp = datetime.datetime.now()

    def __repr__(self):
        return (f"Order(ID={self.order_id}, Client={self.client}, Side={self.side.name}, "
                f"Price={self.price:.2f}, Vol={self.volume}, TS={self.timestamp})")

class OrderBook:
    def __init__(self, history_limit: int = 200):
        # Heaps store: (price_key, queue_object)
        self.asks_heap = [] # Min-heap: (price, deque)
        self.bids_heap = [] # Max-heap: (-price, deque)

        # Maps
        self.order_map = {} # {order_id: order_object}

        # Key: (price, side), Value: deque object containing Orders
        self.queue_map = {}
        # Key: (price, side), Value: total active volume (int) at that level
        self.volume_map = {}

        self._order_id_counter = 1
        self.trade_log = []
        
        self.price_history = deque(maxlen=history_limit) # Use deque with maxlen for limited history
        self.last_recorded_mid_price = None

    def _generate_order_id(self) -> int:
        """Generates a unique sequential order ID."""
        order_id = self._order_id_counter
        self._order_id_counter += 1
        return order_id
    
    def _update_price_history(self):
        """Calculates mid-price and adds to history if changed."""
        best_bid = self.get_best_bid() # Uses the method with lazy cleanup
        best_ask = self.get_best_ask() # Uses the method with lazy cleanup

        mid_price = None
        if best_bid is not None and best_ask is not None:
            mid_price = round((best_bid + best_ask) / 2.0, 2) # Calculate mid-price
        elif best_bid is not None:
             mid_price = best_bid # Use best bid if no ask
        elif best_ask is not None:
             mid_price = best_ask # Use best ask if no bid

        # Only record if price exists and is different from the last recorded one
        if mid_price is not None and mid_price != self.last_recorded_mid_price:
             now = datetime.datetime.now()
             self.price_history.append((now.timestamp() * 1000, mid_price)) # Store as (JS timestamp ms, price)
             self.last_recorded_mid_price = mid_price
             logger.debug(f"Price History Updated: ({now.timestamp()*1000}, {mid_price})")
    
    def _add_order_to_book(self, order: Order):
        """Adds an order to the corresponding price queue and updates structures."""
        price = order.price
        side = order.side
        map_key = (price, side)
        heap = self.asks_heap if side == Side.SELL else self.bids_heap
        price_key = price if side == Side.SELL else -price

        print(f"Adding Order {order.order_id} to book: Price={price}, Side={side.name}")

        self.volume_map[map_key] = self.volume_map.get(map_key, 0) + order.volume
        print(f" Volume map updated for {map_key}: New total vol = {self.volume_map[map_key]}")

        if map_key not in self.queue_map:
            new_queue = deque()
            new_queue.append(order)
            self.queue_map[map_key] = new_queue
            heapq.heappush(heap, (price_key, new_queue))
            print(f" New queue created for {map_key} and pushed to heap.")
        else:
            self.queue_map[map_key].append(order)
            print(f" Order {order.order_id} appended to existing queue for {map_key}.")
    
    def place_order(self, client: str, side: Side, price: float, volume: int) -> tuple[int, List[Trade]]:
        """Places order, matches, adds remainder, RETURNS order_id and list of structured trades."""
        order_id = self._generate_order_id()
        # Store the incoming order as the taker initially
        taker_order = Order(order_id, client, side, price, volume)
        self.order_map[order_id] = taker_order

        logger.info(f"Received Order: {taker_order}")
        trades_executed: List[Trade] = [] # MODIFIED: Use list of Trade dicts

        # Determine which side to match against
        if taker_order.side == Side.BUY:
            opposite_heap = self.asks_heap # Buy order matches against asks
            while taker_order.volume > 0 and opposite_heap and taker_order.price >= opposite_heap[0][0]:
                best_price_key, best_queue = opposite_heap[0]
                actual_best_price = best_price_key

                if not best_queue:
                    logger.warning(f"Empty queue found in asks heap at price {actual_best_price:.2f}. Cleaning.")
                    heapq.heappop(opposite_heap)
                    map_key_del = (actual_best_price, Side.SELL)
                    if map_key_del in self.queue_map: del self.queue_map[map_key_del]
                    continue

                # Process orders in the best price queue
                while best_queue and taker_order.volume > 0:
                    # The resting order in the book is the maker
                    maker_order = best_queue[0]
                    trade_volume = min(taker_order.volume, maker_order.volume)
                    trade_price = maker_order.price # Trade happens at the resting order's price
                    trade_timestamp = datetime.datetime.now().timestamp() * 1000 # JS timestamp

                    # Create structured trade info
                    trade: Trade = {
                        "timestamp": trade_timestamp,
                        "price": trade_price,
                        "volume": trade_volume,
                        "maker_order_id": maker_order.order_id,
                        "taker_order_id": taker_order.order_id,
                        "maker_client": maker_order.client,
                        "taker_client": taker_order.client,
                    }
                    trades_executed.append(trade)
                    # Optionally log the structured trade
                    logger.info(f"  Trade Executed: Vol={trade['volume']} @ Price={trade['price']:.2f} (TakerID:{trade['taker_order_id']} vs MakerID:{trade['maker_order_id']})")
                    # Also add the old string format to the internal log for compatibility if needed elsewhere
                    trade_info_str = (f"Trade Executed: {trade_volume} shares @ {trade_price:.2f} "
                                      f"(Incoming: {taker_order.client} ID:{taker_order.order_id}, "
                                      f"Resting: {maker_order.client} ID:{maker_order.order_id})")
                    self.trade_log.append(trade_info_str) # Keep old log format internally if desired

                    # Update volumes
                    taker_order.volume -= trade_volume
                    maker_order.volume -= trade_volume
                    maker_map_key = (maker_order.price, maker_order.side)
                    self.volume_map[maker_map_key] -= trade_volume
                    logger.info(f"  Volume map updated for {maker_map_key}: New total vol = {self.volume_map.get(maker_map_key, 0)}")

                    # Handle fully filled maker order
                    if maker_order.volume == 0:
                        filled_order_id = maker_order.order_id
                        best_queue.popleft()
                        logger.info(f"  Maker Order {filled_order_id} fully filled and removed from queue.")
                        if filled_order_id in self.order_map:
                            del self.order_map[filled_order_id]

                # Clean up empty price level from heap
                if not best_queue:
                    logger.info(f" Queue for price {actual_best_price:.2f} is now empty. Removing from heap.")
                    heapq.heappop(opposite_heap)
                    map_key_to_delete = (actual_best_price, Side.SELL)
                    if map_key_to_delete in self.queue_map: del self.queue_map[map_key_to_delete]
                    if map_key_to_delete in self.volume_map and self.volume_map[map_key_to_delete] <= 0:
                        del self.volume_map[map_key_to_delete]

        else: # taker_order.side == Side.SELL
            opposite_heap = self.bids_heap # Sell order matches against bids
            while taker_order.volume > 0 and opposite_heap and taker_order.price <= -opposite_heap[0][0]:
                best_price_key, best_queue = opposite_heap[0]
                actual_best_price = -best_price_key # Price is negative in bids heap

                if not best_queue:
                    logger.warning(f"Empty queue found in bids heap at price {actual_best_price:.2f}. Cleaning.")
                    heapq.heappop(opposite_heap)
                    map_key_del = (actual_best_price, Side.BUY)
                    if map_key_del in self.queue_map: del self.queue_map[map_key_del]
                    continue

                # Process orders in the best price queue
                while best_queue and taker_order.volume > 0:
                    # The resting order in the book is the maker
                    maker_order = best_queue[0]
                    trade_volume = min(taker_order.volume, maker_order.volume)
                    trade_price = maker_order.price # Trade happens at the resting order's price
                    trade_timestamp = datetime.datetime.now().timestamp() * 1000 # JS timestamp

                    # Create structured trade info
                    trade: Trade = {
                        "timestamp": trade_timestamp,
                        "price": trade_price,
                        "volume": trade_volume,
                        "maker_order_id": maker_order.order_id,
                        "taker_order_id": taker_order.order_id,
                        "maker_client": maker_order.client,
                        "taker_client": taker_order.client,
                    }
                    trades_executed.append(trade)
                    # Optionally log the structured trade
                    logger.info(f"  Trade Executed: Vol={trade['volume']} @ Price={trade['price']:.2f} (TakerID:{trade['taker_order_id']} vs MakerID:{trade['maker_order_id']})")
                    # Also add the old string format to the internal log for compatibility if needed elsewhere
                    trade_info_str = (f"Trade Executed: {trade_volume} shares @ {trade_price:.2f} "
                                      f"(Incoming: {taker_order.client} ID:{taker_order.order_id}, "
                                      f"Resting: {maker_order.client} ID:{maker_order.order_id})")
                    self.trade_log.append(trade_info_str) # Keep old log format internally if desired


                    # Update volumes
                    taker_order.volume -= trade_volume
                    maker_order.volume -= trade_volume
                    maker_map_key = (maker_order.price, maker_order.side)
                    self.volume_map[maker_map_key] -= trade_volume
                    logger.info(f"  Volume map updated for {maker_map_key}: New total vol = {self.volume_map.get(maker_map_key, 0)}")

                    # Handle fully filled maker order
                    if maker_order.volume == 0:
                        filled_order_id = maker_order.order_id
                        best_queue.popleft()
                        logger.info(f"  Maker Order {filled_order_id} fully filled and removed from queue.")
                        if filled_order_id in self.order_map:
                            del self.order_map[filled_order_id]

                # Clean up empty price level from heap
                if not best_queue:
                    logger.info(f" Queue for price {actual_best_price:.2f} is now empty. Removing from heap.")
                    heapq.heappop(opposite_heap)
                    map_key_to_delete = (actual_best_price, Side.BUY)
                    if map_key_to_delete in self.queue_map: del self.queue_map[map_key_to_delete]
                    if map_key_to_delete in self.volume_map and self.volume_map[map_key_to_delete] <= 0:
                        del self.volume_map[map_key_to_delete]

        # Add remaining taker volume to the book
        if taker_order.volume > 0:
            logger.info(f"Order {order_id} has remaining volume {taker_order.volume}. Adding to book.")
            self._add_order_to_book(taker_order)
        else:
            logger.info(f"Order {order_id} fully filled during matching.")
            if order_id in self.order_map:
                del self.order_map[order_id] # Remove fully filled taker order

        self._update_price_history()

        return order_id, trades_executed # MODIFIED: Return structured trades

    def get_volume_at_price(self, price: float, side: Side) -> int:
         """Returns the total active volume at a specific price and side using volume_map (O(1))."""
         map_key = (price, side)
         return self.volume_map.get(map_key, 0)


# order_book_logic.py

# ... (imports, Side, Order, OrderBook __init__ with self.price_history, _generate_order_id, _update_price_history ) ...

# Keep your existing cancel_order logic, just add one line at the end

    def cancel_order(self, order_id: int) -> bool: # Added return type hint
        """Actively removes an order from its queue and updates structures (Phase 2)."""
        if order_id not in self.order_map:
            # Use logger if available, otherwise print
            logger.warning(f"Cancel failed: Order {order_id} not found.")
            return False

        order_to_cancel = self.order_map[order_id]

        # Check if already filled (it shouldn't be in map if truly filled, but defensive)
        if order_to_cancel.volume <= 0:
             logger.warning(f"Cancel failed: Order {order_id} has zero volume (already filled?).")
             # Clean up map just in case
             if order_id in self.order_map: del self.order_map[order_id]
             return False

        price = order_to_cancel.price
        side = order_to_cancel.side
        map_key = (price, side)
        # price_key = price if side == Side.SELL else -price # Not needed for removal logic itself
        # heap = self.asks_heap if side == Side.SELL else self.bids_heap # Not needed for removal logic itself

        logger.info(f"Attempting active cancel for Order {order_id} at {map_key}")

        original_volume = order_to_cancel.volume # Store volume before setting to 0 or removing

        # 1. Update Volume Map *before* potential errors removing from queue
        volume_updated = False
        if map_key in self.volume_map:
            self.volume_map[map_key] -= original_volume # Use stored volume
            volume_updated = True
            logger.info(f" Volume map updated for {map_key}: New total vol = {self.volume_map.get(map_key, 0)}")
            if self.volume_map[map_key] <= 0:
                logger.info(f" Volume for {map_key} reached 0, removing from volume_map.")
                del self.volume_map[map_key]
        else:
             logger.warning(f"Cannot find volume map entry {map_key} during cancel for order {order_id}.")


        # 2. Remove Order from Queue
        queue_exists = map_key in self.queue_map
        queue_removed = False
        queue_became_empty = False
        if queue_exists:
            queue = self.queue_map[map_key]
            try:
                # NOTE: deque.remove(value) is O(N). DLL opt needed for O(1).
                queue.remove(order_to_cancel)
                queue_removed = True
                logger.info(f" Order {order_id} removed from queue for {map_key}.")

                # 3. If Queue is now empty, remove from queue_map (Heap removal remains lazy)
                if not queue:
                    queue_became_empty = True
                    logger.info(f" Queue for {map_key} is now empty. Removing from queue_map.")
                    del self.queue_map[map_key]
                    # Heap cleanup is handled by get_best_bid/ask or matching logic
                    logger.info(f" NOTE: Price level {map_key} relies on lazy removal from heap.")

            except ValueError:
                # This means the order wasn't in the queue it was expected to be in.
                # This could happen if it was filled by another thread between check and here (in real world)
                # Or if state is inconsistent.
                logger.error(f"CRITICAL WARNING: Order {order_id} in order_map but NOT FOUND in its expected queue {map_key} during cancel!")
                # Should we still proceed with removing from order_map? Yes, probably.
                # Should we revert volume_map change? Maybe, depends on desired consistency level.
                # For now, we proceed but log severity.
        else:
             logger.warning(f"Cannot find queue map entry {map_key} during cancel for order {order_id}.")

        # 4. Remove Order from Order Map (Always attempt this if found initially)
        if order_id in self.order_map:
            del self.order_map[order_id]
            logger.info(f" Order {order_id} removed from order_map.")
        else:
            # This case should ideally not happen if initial check passed and no errors above
             logger.warning(f"Order {order_id} missing from order_map at end of cancel function.")


        # --- ADD HISTORY UPDATE ---
        # Update price history if the cancellation likely changed the book state
        # (e.g., if volume was successfully updated or queue became empty)
        if volume_updated or queue_became_empty:
            self._update_price_history()
        # --- End History Update ---

        # Return True if we at least removed it from the order map
        # A more robust check might verify queue_removed is True
        return True # Assuming if we got here, the cancel was intended and mostly processed


    def get_best_bid(self) -> float | None:
        """Gets the highest bid price with active volume, cleaning up inactive levels."""
        while self.bids_heap:
            neg_price, queue = self.bids_heap[0]
            price = -neg_price
            map_key = (price, Side.BUY)

            if self.volume_map.get(map_key, 0) > 0:
                return price
            else:
                print(f"Lazy cleaning bids heap: Removing inactive level {price:.2f}")
                heapq.heappop(self.bids_heap)
        return None
    
    def get_best_ask(self) -> float | None:
        """Gets the lowest ask price with active volume, cleaning up inactive levels."""
        while self.asks_heap:
            price, queue = self.asks_heap[0]
            map_key = (price, Side.SELL)

            if self.volume_map.get(map_key, 0) > 0:
                return price
            else:
                print(f"Lazy cleaning asks heap: Removing inactive level {price:.2f}")
                heapq.heappop(self.asks_heap)
        return None
    
    def get_order_book_snapshot(self, levels: int = 5) -> dict:
        """Returns aggregated volume snapshot using volume_map (Phase 2)."""
        bids_snap = []
        potential_bids = heapq.nsmallest(levels * 2 + 5, self.bids_heap)
        bid_count = 0
        for neg_price, queue in potential_bids:
            if bid_count >= levels: break
            price = -neg_price
            volume = self.volume_map.get((price, Side.BUY), 0)
            if volume > 0:
                 bids_snap.append({"price": price, "volume": volume})
                 bid_count += 1


        asks_snap = []
        potential_asks = heapq.nsmallest(levels * 2 + 5, self.asks_heap)
        ask_count = 0
        for price, queue in potential_asks:
             if ask_count >= levels: break
             volume = self.volume_map.get((price, Side.SELL), 0)
             if volume > 0:
                 asks_snap.append({"price": price, "volume": volume})
                 ask_count += 1

        return {"bids": bids_snap, "asks": asks_snap}
    
    def print_trade_log(self):
        print("\n--- Trade Log ---")
        if not self.trade_log:
            print("No trades executed.")
        else:
            for trade in self.trade_log:
                print(trade)
        print("-----------------\n")