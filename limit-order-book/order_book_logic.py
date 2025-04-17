from enum import Enum, auto
import datetime
import heapq
from collections import deque
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - LGC - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class Side(Enum):
    BUY = auto()
    SELL = auto()

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
    def __init__(self):
        # Heaps store: (price_key, queue_object)
        self.asks_heap = [] # Min-heap: (price, deque)
        self.bids_heap = [] # Max-heap: (-price, deque)

        # Maps
        self.order_map = {} # {order_id: order_object} - Still needed

        # Key: (price, side), Value: deque object containing Orders
        self.queue_map = {}
        # Key: (price, side), Value: total active volume (int) at that level
        self.volume_map = {}

        self._order_id_counter = 1
        self.trade_log = []

    def _generate_order_id(self) -> int:
        """Generates a unique sequential order ID."""
        order_id = self._order_id_counter
        self._order_id_counter += 1
        return order_id
    
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
    
    def place_order(self, client: str, side: Side, price: float, volume: int) -> tuple[int, list[str]]:
        """Places order, matches, adds remainder, RETURNS order_id and trades list."""
        order_id = self._generate_order_id()
        order = Order(order_id, client, side, price, volume)
        self.order_map[order_id] = order

        logger.info(f"Received Order: {order}")
        trades_executed_by_this_order = []

        if order.side == Side.BUY:
            opposite_heap = self.asks_heap
            while order.volume > 0 and opposite_heap and order.price >= opposite_heap[0][0]:
                best_price_key, best_queue = opposite_heap[0]
                actual_best_price = best_price_key

                if not best_queue:
                    logger.warning(f"Empty queue found in asks heap at price {actual_best_price:.2f}. Cleaning.")
                    heapq.heappop(opposite_heap)
                    map_key_del = (actual_best_price, Side.SELL)
                    if map_key_del in self.queue_map: del self.queue_map[map_key_del]
                    continue

                while best_queue and order.volume > 0:
                    resting_order = best_queue[0]
                    trade_volume = min(order.volume, resting_order.volume)
                    trade_price = resting_order.price
                    trade_info = (f"Trade Executed: {trade_volume} shares @ {trade_price:.2f} "
                                f"(Incoming: {order.client} ID:{order.order_id}, "
                                f"Resting: {resting_order.client} ID:{resting_order.order_id})")
                    trades_executed_by_this_order.append(trade_info)
                    self.trade_log.append(trade_info)
                    logger.info(f"  {trade_info}")

                    order.volume -= trade_volume
                    resting_order.volume -= trade_volume
                    resting_map_key = (resting_order.price, resting_order.side)
                    self.volume_map[resting_map_key] -= trade_volume
                    logger.info(f"  Volume map updated for {resting_map_key}: New total vol = {self.volume_map.get(resting_map_key, 0)}")

                    if resting_order.volume == 0:
                        filled_order_id = resting_order.order_id
                        best_queue.popleft()
                        logger.info(f"  Resting Order {filled_order_id} fully filled and removed from queue.")
                        if filled_order_id in self.order_map:
                            del self.order_map[filled_order_id]

                if not best_queue:
                    logger.info(f" Queue for price {actual_best_price:.2f} is now empty. Removing from heap.")
                    heapq.heappop(opposite_heap)
                    map_key_to_delete = (actual_best_price, Side.SELL)
                    if map_key_to_delete in self.queue_map: del self.queue_map[map_key_to_delete]
                    if map_key_to_delete in self.volume_map and self.volume_map[map_key_to_delete] <= 0:
                        del self.volume_map[map_key_to_delete]

        else:
            opposite_heap = self.bids_heap
            while order.volume > 0 and opposite_heap and order.price <= -opposite_heap[0][0]:
                best_price_key, best_queue = opposite_heap[0]
                actual_best_price = -best_price_key

                if not best_queue:
                    logger.warning(f"Empty queue found in bids heap at price {actual_best_price:.2f}. Cleaning.")
                    heapq.heappop(opposite_heap)
                    map_key_del = (actual_best_price, Side.BUY)
                    if map_key_del in self.queue_map: del self.queue_map[map_key_del]
                    continue

                while best_queue and order.volume > 0:
                    resting_order = best_queue[0]
                    trade_volume = min(order.volume, resting_order.volume)
                    trade_price = resting_order.price
                    trade_info = (f"Trade Executed: {trade_volume} shares @ {trade_price:.2f} "
                                f"(Incoming: {order.client} ID:{order.order_id}, "
                                f"Resting: {resting_order.client} ID:{resting_order.order_id})")
                    trades_executed_by_this_order.append(trade_info)
                    self.trade_log.append(trade_info)
                    logger.info(f"  {trade_info}")

                    order.volume -= trade_volume
                    resting_order.volume -= trade_volume
                    resting_map_key = (resting_order.price, resting_order.side)
                    self.volume_map[resting_map_key] -= trade_volume
                    logger.info(f"  Volume map updated for {resting_map_key}: New total vol = {self.volume_map.get(resting_map_key, 0)}")

                    if resting_order.volume == 0:
                        filled_order_id = resting_order.order_id
                        best_queue.popleft()
                        logger.info(f"  Resting Order {filled_order_id} fully filled and removed from queue.")
                        if filled_order_id in self.order_map:
                            del self.order_map[filled_order_id]


                if not best_queue:
                    logger.info(f" Queue for price {actual_best_price:.2f} is now empty. Removing from heap.")
                    heapq.heappop(opposite_heap)
                    map_key_to_delete = (actual_best_price, Side.BUY)
                    if map_key_to_delete in self.queue_map: del self.queue_map[map_key_to_delete]
                    if map_key_to_delete in self.volume_map and self.volume_map[map_key_to_delete] <= 0:
                        del self.volume_map[map_key_to_delete]

        if order.volume > 0:
            logger.info(f"Order {order_id} has remaining volume {order.volume}. Adding to book.")
            self._add_order_to_book(order)
        else:
            logger.info(f"Order {order_id} fully filled during matching.")
            if order_id in self.order_map:
                del self.order_map[order_id]

        return order_id, trades_executed_by_this_order

    def get_volume_at_price(self, price: float, side: Side) -> int:
         """Returns the total active volume at a specific price and side using volume_map (O(1))."""
         map_key = (price, side)
         return self.volume_map.get(map_key, 0)


    def cancel_order(self, order_id: int):
        """Actively removes an order from its queue and updates structures (Phase 2)."""
        if order_id not in self.order_map:
            print(f"Cancel failed: Order {order_id} not found.")
            return False
        
        order_to_cancel = self.order_map[order_id]

        if order_to_cancel.volume == 0:
             print(f"Cancel failed: Order {order_id} seems already filled (volume is 0).")
             return False
        price = order_to_cancel.price
        side = order_to_cancel.side
        map_key = (price, side)
        price_key = price if side == Side.SELL else -price
        heap = self.asks_heap if side == Side.SELL else self.bids_heap

        print(f"Attempting active cancel for Order {order_id} at {map_key}")

        if map_key in self.volume_map:
            self.volume_map[map_key] -= order_to_cancel.volume
            print(f" Volume map updated for {map_key}: New total vol = {self.volume_map[map_key]}")
            if self.volume_map[map_key] <= 0:
                print(f" Volume for {map_key} reached 0, removing from volume_map.")
                del self.volume_map[map_key]
        else:
             print(f"Warning: Cannot find volume map entry for {map_key} during cancel.")

        if map_key in self.queue_map:
            queue = self.queue_map[map_key]

            try:
                queue.remove(order_to_cancel)
                print(f" Order {order_id} removed from queue for {map_key}.")
                if not queue:
                    print(f" Queue for {map_key} is now empty. Removing from queue_map.")
                    del self.queue_map[map_key]
            except ValueError:
                print(f"Warning: Order {order_id} not found in its expected queue {map_key}.")
        else:
             print(f"Warning: Cannot find queue map entry for {map_key} during cancel.")

        del self.order_map[order_id]
        print(f" Order {order_id} removed from order_map.")
        return True


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