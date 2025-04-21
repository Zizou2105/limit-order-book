// src/App.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import SimulatorChart from './components/SimulatorChart'; // Uses Lightweight Charts now
import OrderBookDisplay from './components/OrderBookDisplay';
import OrderEntryForm from './components/OrderEntryForm';
import ClientOrders from './components/ClientOrders';
import RecentTrades from './components/RecentTrades';
import './App.css'; // Your main CSS
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Ensure fallback works if ENV var isn't set during local dev
const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const WS_URL = API_URL.replace('http', 'ws') + '/ws';
const MAX_PRICE_HISTORY = 100; // Limit the number of historical points for the chart

function App() {
  const [bids, setBids] = useState([]);
  const [asks, setAsks] = useState([]);
  const [lastTrades, setLastTrades] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]); // State for chart data
  const [isLoading, setIsLoading] = useState(true); // Combined loading state
  const [error, setError] = useState(null); // Combined error state
  const [clientOrders, setClientOrders] = useState([]);
  const [currentClient, setCurrentClient] = useState('ReactClient');
  const [isSimulatorActive, setIsSimulatorActive] = useState(false); // NEW: State for simulator toggle - Start OFF
  const wsRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Debug function to log state changes
  const logStateChange = (name, newValue) => {
    console.log(`State change - ${name}:`, newValue);
  };

  // Calculate mid-price and update history
  useEffect(() => {
    // Ensure bids and asks are sorted correctly (highest bid first, lowest ask first)
    const sortedBids = [...bids].sort((a, b) => b.price - a.price);
    const sortedAsks = [...asks].sort((a, b) => a.price - b.price);
    
    const bestBid = sortedBids.length > 0 ? sortedBids[0].price : null;
    const bestAsk = sortedAsks.length > 0 ? sortedAsks[0].price : null;

    if (bestBid !== null && bestAsk !== null) {
      const midPrice = (bestBid + bestAsk) / 2;
      const timestamp = Date.now(); // Use current timestamp
      
      setPriceHistory(prevHistory => {
        const newHistory = [...prevHistory, { timestamp, price: midPrice }];
        // Keep only the last MAX_PRICE_HISTORY points
        return newHistory.slice(-MAX_PRICE_HISTORY);
      });
      // Limit logging frequency if needed, but for now log every update
      // console.log(`Mid-price updated: ${midPrice} at ${timestamp}`);
    } else if (bestBid !== null) {
        // Only bids exist, maybe use best bid as price?
        // setPriceHistory(...) 
    } else if (bestAsk !== null) {
        // Only asks exist, maybe use best ask as price?
        // setPriceHistory(...)
    }
    // Only update when bids or asks change
  }, [bids, asks]);

  // WebSocket connection management
  useEffect(() => {
    let wsInstance = null;
    let pingIntervalId = null;
    let isActive = true;
    let connectTimeoutId = null;

    const cleanup = () => {
      console.log('Cleanup called.');
      isActive = false;
      
      if (pingIntervalId) {
        clearInterval(pingIntervalId);
        pingIntervalId = null;
      }
      
      if (connectTimeoutId) {
        clearTimeout(connectTimeoutId);
        connectTimeoutId = null;
      }
      
      if (wsInstance && (wsInstance.readyState === WebSocket.OPEN || wsInstance.readyState === WebSocket.CONNECTING)) {
        console.log(`Cleanup: Closing WS instance (readyState: ${wsInstance.readyState})`);
        wsInstance.close(1000, "Component unmounting");
      }
      
      if (wsRef.current === wsInstance) {
        wsRef.current = null;
      }
    };

    const connect = () => {
      if (!isActive) {
        console.log('Connect skipped: Effect instance is no longer active');
        return;
      }

      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        console.log(`Connect skipped: Existing connection state is ${wsRef.current.readyState}`);
        if (wsRef.current.readyState === WebSocket.OPEN) setIsLoading(false);
        return;
      }

      console.log(`Attempting WebSocket connection to ${WS_URL} (Attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
      setIsLoading(true);
      setError(null);

      try {
        wsInstance = new WebSocket(WS_URL);
        wsRef.current = wsInstance;

        wsInstance.onopen = () => {
          if (!isActive || wsInstance !== wsRef.current) {
            console.log("onopen: Instance mismatch or effect inactive. Closing connection.");
            wsInstance.close();
            return;
          }
          
          console.log('WebSocket connection established successfully');
          reconnectAttempts.current = 0;
          setIsLoading(false);
          setError(null);

          // Setup ping
          if (pingIntervalId) clearInterval(pingIntervalId);
          pingIntervalId = setInterval(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'ping' }));
            } else {
              clearInterval(pingIntervalId);
              pingIntervalId = null;
            }
          }, 30000);
        };

        wsInstance.onmessage = (event) => {
          if (!isActive || wsInstance !== wsRef.current) {
            console.log("onmessage: Instance mismatch or effect inactive. Ignoring message.");
            return;
          }

          try {
            const messageData = JSON.parse(event.data);
            console.log('Received WebSocket message:', messageData);

            // --- Process based on message type ---
            if (messageData.type === 'pong') {
                // Handle pong if necessary (e.g., update last pong time)
                // console.log('Pong received');
                return; // Nothing else to do for pong
            }

            if (messageData.type === 'connection_established') {
                console.log('Processing connection_established message');
                const initialState = messageData.initial_state || {};
                // Set initial state from connection message
                setBids(initialState.bids || []);
                setAsks(initialState.asks || []);
                // Potentially fetch history or other initial data here if needed
                setIsLoading(false); // Mark loading as complete
                return; // Processed connection message
            }


            if (messageData.type === 'order_book_update') {
              console.log('Processing order book update');

              // Process other state updates first (these might also need functional updates if they depend on prev state)
              let nextBids = messageData.data?.bids || bids;
              let nextAsks = messageData.data?.asks || asks;
              let nextLastTrades = lastTrades;
              let nextPriceHistory = priceHistory;
              const toastsToShow = []; // Collect toasts

              const cancelledId = messageData.cancelled_order_id;
              const trades = messageData.trades || [];

               // Update non-clientOrders states (can still be batched if simple)
              if (messageData.data) {
                  setBids(messageData.data.bids || []);
                  setAsks(messageData.data.asks || []);
              }
              if (trades.length > 0) {
                 setLastTrades(prev => [...trades, ...prev].slice(0, 15));
                 setPriceHistory(prev => {
                     const tradeHistoryPoints = trades.map(trade => ({
                         timestamp: trade.timestamp,
                         price: trade.price,
                         isTrade: true
                     }));
                     return [...prev, ...tradeHistoryPoints].slice(-MAX_PRICE_HISTORY);
                 });
              }

              // ---> UPDATE clientOrders USING FUNCTIONAL UPDATE FORM <---
              setClientOrders(prevClientOrders => {
                console.log('Functional update: Calculating client order updates. Starting prevClientOrders:', prevClientOrders);
                let ordersAfterUpdates = [...prevClientOrders]; // Start with a mutable copy
                let newOrderToAdd = null;

                // 0. Check if a new order relevant to this client was placed in this message
                const placedOrderDetails = messageData.placed_order_details;
                if (placedOrderDetails && placedOrderDetails.client === currentClient) {
                    console.log(`Functional update: Received details for newly placed order ${placedOrderDetails.order_id}`);
                    // Prepare the new order object, but don't add it yet.
                    // We need to process trades first to see if it gets immediately filled.
                    newOrderToAdd = {
                         order_id: placedOrderDetails.order_id,
                         client: placedOrderDetails.client,
                         side: placedOrderDetails.side, // Assuming backend sends string 'BUY'/'SELL'
                         price: placedOrderDetails.price,
                         volume: placedOrderDetails.volume,
                         timestamp: placedOrderDetails.timestamp // Assuming backend sends JS timestamp
                    };
                }

                // 1. Handle Cancellations first
                if (cancelledId) {
                    console.log(`Functional update: Checking cancellation for ${cancelledId}`);
                    const initialLength = ordersAfterUpdates.length;
                    ordersAfterUpdates = ordersAfterUpdates.filter(order => order.order_id !== cancelledId);
                    if (ordersAfterUpdates.length < initialLength) {
                         console.log(`Functional update: Order ${cancelledId} removed by cancellation.`);
                         // Find the actual cancelled order from the original list for toast
                         const cancelledOrder = prevClientOrders.find(o => o.order_id === cancelledId);
                         if (cancelledOrder) {
                            toastsToShow.push({ type: 'info', message: `Your Order ${cancelledId} was cancelled.` });
                         }
                         // If the newly placed order was the one cancelled, nullify it
                         if (newOrderToAdd && newOrderToAdd.order_id === cancelledId) {
                             console.log(`Functional update: Newly placed order ${cancelledId} was immediately cancelled.`);
                             newOrderToAdd = null;
                         }
                    }
                }

                // 2. Handle Trades (update volume or mark for removal)
                let filledOrderIds = new Set(); // Keep track of orders fully filled by trades in this message
                if (trades.length > 0) {
                    console.log('Functional update: Processing trades:', trades);
                    ordersAfterUpdates = ordersAfterUpdates.map(order => {
                        // Find the first trade involving this order (maker or taker)
                        const fillingTrade = trades.find(trade => {
                             return (order.client === trade.maker_client && order.order_id === trade.maker_order_id) ||
                                    (order.client === trade.taker_client && order.order_id === trade.taker_order_id);
                        });

                        if (fillingTrade) {
                            const role = (order.client === fillingTrade.maker_client && order.order_id === fillingTrade.maker_order_id) ? 'MAKER' : 'TAKER';
                            console.log(`Functional update: Trade involves client's ${role} order: ${order.order_id}`);
                            const remainingVolume = order.volume - fillingTrade.volume;
                            if (remainingVolume > 0) {
                                console.log(`Functional update: Order ${order.order_id} partially filled. Remaining: ${remainingVolume}`);
                                toastsToShow.push({ type: 'info', message: `Your Order ${order.order_id} partially filled: ${fillingTrade.volume} @ ${fillingTrade.price.toFixed(2)}` });
                                return { ...order, volume: remainingVolume }; // Update volume
                            } else {
                                console.log(`Functional update: Order ${order.order_id} fully filled by trade.`);
                                toastsToShow.push({ type: 'success', message: `Your Order ${order.order_id} fully filled: ${fillingTrade.volume} @ ${fillingTrade.price.toFixed(2)}` });
                                filledOrderIds.add(order.order_id); // Mark as filled
                                return null; // Mark for removal later
                            }
                        }
                        return order; // No trade involves this order
                    }).filter(Boolean); // Remove null entries (orders fully filled by existing trades)

                     // Check if the *newly placed* order was immediately filled
                     if (newOrderToAdd) {
                        const fillingTradeForNewOrder = trades.find(trade => {
                            // The new order could only be the taker in the trade it caused
                            return (newOrderToAdd.client === trade.taker_client && newOrderToAdd.order_id === trade.taker_order_id);
                        });
                         if (fillingTradeForNewOrder) {
                              const remainingVolume = newOrderToAdd.volume - fillingTradeForNewOrder.volume;
                              if (remainingVolume <= 0) {
                                  console.log(`Functional update: Newly placed order ${newOrderToAdd.order_id} was immediately fully filled.`);
                                  filledOrderIds.add(newOrderToAdd.order_id); // Mark as filled
                                  toastsToShow.push({ type: 'success', message: `Your Order ${newOrderToAdd.order_id} fully filled: ${fillingTradeForNewOrder.volume} @ ${fillingTradeForNewOrder.price.toFixed(2)}` });
                                  newOrderToAdd = null; // Don't add it if it was immediately filled
                              } else {
                                   console.log(`Functional update: Newly placed order ${newOrderToAdd.order_id} was immediately partially filled. Remaining: ${remainingVolume}`);
                                   // Update the volume of the order we plan to add
                                   newOrderToAdd.volume = remainingVolume;
                                    toastsToShow.push({ type: 'info', message: `Your Order ${newOrderToAdd.order_id} partially filled: ${fillingTradeForNewOrder.volume} @ ${fillingTradeForNewOrder.price.toFixed(2)}` });
                              }
                         }
                     }
                }

                // 3. Add the new order if it exists and wasn't filled/cancelled
                if (newOrderToAdd) {
                    // Check if it already exists (e.g., edge case from rapid reconnect/message duplication)
                    if (!ordersAfterUpdates.some(o => o.order_id === newOrderToAdd.order_id)) {
                         console.log(`Functional update: Adding new order ${newOrderToAdd.order_id} to client list.`);
                         ordersAfterUpdates.push(newOrderToAdd);
                         // Sort orders maybe? By timestamp or ID?
                         ordersAfterUpdates.sort((a, b) => a.timestamp - b.timestamp); // Example sort by time
                    } else {
                         console.log(`Functional update: New order ${newOrderToAdd.order_id} already exists, not adding again.`);
                    }
                }


                console.log('Functional update: Resulting client orders:', ordersAfterUpdates);
                // Avoid setting state if the final array is identical to the previous one
                if (ordersAfterUpdates.length === prevClientOrders.length && ordersAfterUpdates.every((order, i) => {
                     // Deep comparison might be needed if order objects change internally (e.g., volume)
                     return order.order_id === prevClientOrders[i]?.order_id && order.volume === prevClientOrders[i]?.volume;
                 })) {
                    console.log('Functional update: No effective changes detected, skipping state update.');
                    // Trigger toasts even if state doesn't change
                     toastsToShow.forEach(t => toast[t.type](t.message));
                    return prevClientOrders;
                }

                 // Trigger toasts just before returning the new state
                 toastsToShow.forEach(t => toast[t.type](t.message));
                return ordersAfterUpdates; // Return the new state
              });

            } else {
               console.warn("Received unhandled WebSocket message type:", messageData.type);
            }

          } catch (e) {
            console.error("Error processing WebSocket message:", e);
          }
        };

        wsInstance.onerror = (event) => {
          if (!isActive || wsInstance !== wsRef.current) {
            console.log("onerror: Instance mismatch or effect inactive. Ignoring error.");
            return;
          }
          console.error('WebSocket error occurred:', event);
        };

        wsInstance.onclose = (event) => {
          if (!isActive || wsInstance !== wsRef.current) {
            console.log("onclose: Instance mismatch or effect inactive. Ignoring close.");
            return;
          }

          console.log(`WebSocket connection closed: Code=${event.code}, Reason='${event.reason}', Clean=${event.wasClean}`);
          
          if (pingIntervalId) {
            clearInterval(pingIntervalId);
            pingIntervalId = null;
          }

          if (wsRef.current === wsInstance) {
            wsRef.current = null;
          }

          if (isActive && event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current += 1;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current - 1), 30000);
            console.log(`Attempting to reconnect in ${delay}ms...`);
            connectTimeoutId = setTimeout(connect, delay);
          } else if (event.code !== 1000) {
            console.error('Max reconnection attempts reached or non-retriable close.');
            setError('WebSocket connection lost. Please refresh.');
            setIsLoading(false);
          } else {
            console.log('Normal closure (1000), not reconnecting.');
            setIsLoading(false);
          }
        };

      } catch (e) {
        console.error('Error creating WebSocket:', e);
        setError(`Failed to create WebSocket: ${e.message}`);
        setIsLoading(false);
        wsRef.current = null;
      }
    };

    connect();
    return cleanup;
  }, []);

  // Fetch initial simulator status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/simulator/status`);
        if (!response.ok) {
          throw new Error('Failed to fetch simulator status');
        }
        const data = await response.json();
        console.log("Fetched initial simulator status:", data.active);
        setIsSimulatorActive(data.active);
      } catch (err) {
        console.error("Error fetching simulator status:", err);
        toast.error("Could not fetch simulator status.");
      }
    };
    fetchStatus();
  }, []); // Run only once on mount

  // Handle Simulator Toggle
  const handleSimulatorToggle = useCallback(async () => {
    const newState = !isSimulatorActive;
    console.log(`Toggling simulator to: ${newState}`);
    // Optimistic UI update
    setIsSimulatorActive(newState);

    try {
      const response = await fetch(`${API_URL}/simulator/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newState }),
      });
      const result = await response.json();
      if (!response.ok || result.active !== newState) {
        console.error("Failed to toggle simulator or backend state mismatch:", result);
        // Revert optimistic update on failure or mismatch
        setIsSimulatorActive(!newState);
        toast.error(`Failed to toggle simulator. Status: ${result.active ? 'ON' : 'OFF'}`);
        throw new Error('Simulator toggle failed');
      }
      console.log("Simulator toggled successfully. New state:", result.active);
      toast.success(`Simulator turned ${result.active ? 'ON' : 'OFF'}`);
    } catch (e) {
      console.error("Error toggling simulator:", e);
      // Revert optimistic update on error
      setIsSimulatorActive(!newState);
      toast.error("Error toggling simulator.");
    }
  }, [isSimulatorActive]); // Dependency on isSimulatorActive

  // Handle Order Submission (passed to OrderEntryForm)
  const handlePlaceOrderSubmit = useCallback(async (client, sideInt, price, volume) => {
    if (!API_URL) {
      setError("API URL not configured.");
      throw new Error("API URL not configured.");
    }
    const orderData = { client, side: sideInt, price, volume };
    console.log("App sending order:", orderData);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      const result = await response.json();
      if (!response.ok) {
        console.error("API Error Response on POST:", result);
        const errorMsg = result.detail || `Order placement failed: ${response.status}`;
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      console.log("App received order result:", result);
      // --- REMOVED --- 
      // Do NOT update clientOrders state from the API response.
      // The WebSocket message is the source of truth for active orders.
      /*
      if (result.order_id) {
        const newOrder = {
            order_id: result.order_id,
            client: client, // Use the submitted client
            side: sideInt === 1 ? 'BUY' : 'SELL', // Use the submitted side
            price: price, // Use the submitted price
            volume: volume, // Use the submitted volume
            status: 'active' // Mark as active immediately
        };
        console.log('Adding/Updating order in clientOrders via HTTP response:', newOrder);
        setClientOrders(prevOrders => {
            // Check if order already exists (e.g., from a rapid WS update - less likely now)
            const existingOrderIndex = prevOrders.findIndex(o => o.order_id === newOrder.order_id);
            let updated;
            if (existingOrderIndex !== -1) {
                // If it exists, update it (though this scenario is less likely to be needed now)
                console.log(`Order ${newOrder.order_id} already exists, updating.`);
                updated = [...prevOrders];
                updated[existingOrderIndex] = newOrder;
            } else {
                // Otherwise, add the new order
                 console.log(`Adding new order ${newOrder.order_id}.`);
                updated = [...prevOrders, newOrder];
            }
             console.log('New clientOrders state after HTTP update:', updated);
            return updated;
        });
      }
      */
      // Optionally, show a success toast based on the API result
      if (result.message) {
          toast.success(result.message);
      }
      if (result.trades_executed && result.trades_executed.length > 0) {
          toast.info(`${result.trades_executed.length} trade(s) executed immediately.`);
      }
      
      return result;
    } catch (e) {
      console.error("Error submitting order:", e);
      setError(e.message || "Failed to submit order.");
      throw e;
    }
  }, []);

  // Handle Order Cancellation
  const handleCancelOrder = useCallback(async (orderId) => {
    if (!API_URL) {
      setError("API URL not configured.");
      throw new Error("API URL not configured.");
    }
    console.log("App cancelling order:", orderId);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/order/${orderId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();
      if (!response.ok) {
        console.error("API Error Response on DELETE:", result);
        const errorMsg = result.detail || `Order cancellation failed: ${response.status}`;
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      console.log("App received cancellation result:", result);
      // Remove the cancelled order from clientOrders
      setClientOrders(prevOrders => prevOrders.filter(order => order.order_id !== orderId));
      return result;
    } catch (e) {
      console.error("Error cancelling order:", e);
      setError(e.message || "Failed to cancel order.");
      throw e;
    }
  }, []);

  return (
    <div className="App">
      <div className="app-content">
        <ToastContainer 
          position="top-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
        />
        <h1>Order Book Simulator</h1>
        {error && <p className="error-text app-error">Error: {error}</p>}
        <div className="main-container">
          <div className="left-panel">
            <div className="chart-container">
              <SimulatorChart 
                priceHistory={priceHistory} 
                isLoading={isLoading} 
                error={null} 
              />
            </div>
          </div>
          
          <div className="middle-panel">
            <div className="order-book-container"> 
              <OrderBookDisplay 
                bids={bids} 
                asks={asks} 
                isLoading={isLoading}
                error={error}
              />
            </div>
            {/* --- Simulator Toggle Switch --- */}
            <div className="simulator-toggle">
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={isSimulatorActive}
                  onChange={handleSimulatorToggle}
                  disabled={isLoading} // Disable while loading WS maybe?
                />
                <span className="slider round"></span>
              </label>
              <span>Auto Trader {isSimulatorActive ? 'ON' : 'OFF'}</span>
            </div>
            {/* --- End Simulator Toggle Switch --- */}
          </div>

          <div className="right-panel">
            <div className="order-entry-section">
              <OrderEntryForm 
                handlePlaceOrder={handlePlaceOrderSubmit} 
                currentClient={currentClient}
              />
            </div>
            <div className="my-orders-section">
              <ClientOrders 
                client={currentClient}
                orders={clientOrders}
                onCancelOrder={handleCancelOrder}
              />
            </div>
          </div>
        </div>
        
        <div className="bottom-panel">
          <div className="recent-activity-content">
            <RecentTrades trades={lastTrades} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;