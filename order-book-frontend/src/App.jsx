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
            const data = JSON.parse(event.data);
            console.log('Received WebSocket message:', data);

            if (data.type === 'order_book_update') {
              console.log('Processing order book update');
              
              // Update order book state
              setBids(data.data.bids || []);
              setAsks(data.data.asks || []);
              
              // Handle order cancellations
              if (data.cancelled_order_id) {
                console.log(`Processing order cancellation: ${data.cancelled_order_id}`);
                setClientOrders(prevOrders => {
                  const newOrders = prevOrders.filter(order => order.order_id !== data.cancelled_order_id);
                  console.log('Updated client orders after cancellation:', newOrders);
                  return newOrders;
                });
              }
              
              // Handle trades
              if (data.trades && data.trades.length > 0) {
                console.log('Processing trades:', data.trades);
                setLastTrades(prevTrades => [...data.trades, ...prevTrades].slice(0, 15));
                
                data.trades.forEach(trade => {
                  console.log('Processing trade:', trade);
                  
                  // Improved trade parsing
                  const tradeMatch = trade.match(/Trade Executed: (\d+) shares @ (\d+\.\d+) \(Incoming: .* ID:(\d+), Resting: .* ID:(\d+)\)/);
                  if (!tradeMatch) {
                    console.error('Failed to parse trade message:', trade);
                    return;
                  }
                  
                  const [, volume, price, incomingOrderId, restingOrderId] = tradeMatch;
                  const parsedVolume = parseInt(volume);
                  const parsedPrice = parseFloat(price);
                  const parsedOrderId = parseInt(incomingOrderId);
                  
                  console.log('Parsed trade details:', {
                    volume: parsedVolume,
                    price: parsedPrice,
                    orderId: parsedOrderId,
                    rawTrade: trade
                  });
                  
                  // Add trade price to price history
                  setPriceHistory(prevHistory => {
                    const newHistory = [...prevHistory, {
                      timestamp: Date.now(),
                      price: parsedPrice,
                      isTrade: true
                    }];
                    console.log('Updated price history with trade:', {
                      newPrice: parsedPrice,
                      historyLength: newHistory.length
                    });
                    return newHistory.slice(-MAX_PRICE_HISTORY);
                  });
                  
                  setClientOrders(prevOrders => {
                    console.log('Current client orders:', prevOrders);
                    const updatedOrders = prevOrders.map(order => {
                      if (order.order_id === parsedOrderId) {
                        console.log(`Found matching order: ${order.order_id}`);
                        const remainingVolume = order.volume - parsedVolume;
                        if (remainingVolume > 0) {
                          console.log(`Order ${parsedOrderId} partially filled. Remaining volume: ${remainingVolume}`);
                          toast.info(`Order ${parsedOrderId} partially filled: ${parsedVolume} @ ${parsedPrice}`);
                          return { ...order, volume: remainingVolume };
                        } else {
                          console.log(`Order ${parsedOrderId} fully filled`);
                          toast.success(`Order ${parsedOrderId} fully filled: ${parsedVolume} @ ${parsedPrice}`);
                          return null;
                        }
                      }
                      return order;
                    }).filter(Boolean);
                    
                    console.log('Updated client orders after trade:', updatedOrders);
                    return updatedOrders;
                  });
                });
              }
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
      // Add the new order to clientOrders
      if (result.order_id) {
        setClientOrders(prevOrders => [...prevOrders, {
          order_id: result.order_id,
          client: client,
          side: sideInt === 1 ? 'BUY' : 'SELL',
          price: price,
          volume: volume
        }]);
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
            <OrderBookDisplay 
              bids={bids} 
              asks={asks} 
              isLoading={isLoading}
              error={error}
            />
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