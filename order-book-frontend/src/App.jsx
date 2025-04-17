// src/App.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import SimulatorChart from './components/SimulatorChart'; // Uses Lightweight Charts now
import OrderBookDisplay from './components/OrderBookDisplay';
import OrderEntryForm from './components/OrderEntryForm';
import RecentTrades from './components/RecentTrades';
import './App.css'; // Your main CSS

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

  // WebSocket connection management - Revised Logic Attempt 3
  useEffect(() => {
    let wsInstance = null; // Local variable for the WebSocket instance in this effect run
    let pingIntervalId = null;
    let isActive = true; // Flag for this effect instance
    let connectTimeoutId = null; // To manage reconnection timeouts

    const cleanup = () => {
        console.log('Cleanup called.');
        isActive = false; 
        if (pingIntervalId) {
            clearInterval(pingIntervalId);
            pingIntervalId = null;
            console.log("Ping interval cleared.");
        }
        if (connectTimeoutId) {
            clearTimeout(connectTimeoutId);
            connectTimeoutId = null;
             console.log("Reconnect timeout cleared.");
        }
        // Critical: Only close the WS instance associated with *this* effect run.
        if (wsInstance) {
            console.log(`Cleanup: Attempting to close WS instance (readyState: ${wsInstance.readyState})`);
            // Avoid closing if already closed/closing
            if (wsInstance.readyState === WebSocket.OPEN || wsInstance.readyState === WebSocket.CONNECTING) {
                try {
                    wsInstance.close(1000, "Component unmounting"); // Close with code 1000
                    console.log("Cleanup: wsInstance.close() called.");
                } catch (e) {
                    console.warn('Cleanup: Error closing WebSocket:', e);
                }
            } else {
                 console.log("Cleanup: wsInstance already closed or closing.");
            }
            // If this instance is the one in the ref, clear the ref. 
            // This is important so the next effect run doesn't see a stale ref.
            if (wsRef.current === wsInstance) {
                 console.log("Cleanup: Clearing wsRef as it matched the instance being cleaned up.");
                 wsRef.current = null;
            }
        } else {
             console.log("Cleanup: No wsInstance for this effect run.");
        }
         console.log('Cleanup finished.');
    };

    const connect = () => {
      // If a connection (from this or another effect run) is already open/connecting, do nothing.
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        console.log(`Connect skipped: Existing connection state is ${wsRef.current.readyState}`);
        // If it's open, ensure loading is false (might have been set true by a previous failed attempt)
        if (wsRef.current.readyState === WebSocket.OPEN) setIsLoading(false);
        return;
      }
      // Prevent connection if this effect instance is no longer active
      if (!isActive) {
         console.log(`Connect skipped: Effect instance is no longer active.`);
         return;
      }

      console.log(`Attempting WebSocket connection to ${WS_URL} (Attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
      setIsLoading(true); // Set loading true when attempting connection
      setError(null); // Clear previous errors

      try {
        wsInstance = new WebSocket(WS_URL);
        wsRef.current = wsInstance; // Assign to ref immediately
        console.log("New WebSocket instance created and assigned to wsRef.");

        wsInstance.onopen = () => {
          // Check if this instance is still the active one in the ref AND the effect is active
          if (!isActive || wsInstance !== wsRef.current) {
            console.log("onopen: Instance mismatch or effect inactive. Closing this instance.");
            if (wsInstance.readyState === WebSocket.OPEN) wsInstance.close();
            return;
          }
          console.log('onopen: WebSocket connection established successfully');
          reconnectAttempts.current = 0; // Reset on successful connection
          setIsLoading(false); // Set loading false on open
          setError(null);

          // Setup ping
          if (pingIntervalId) clearInterval(pingIntervalId); // Clear any previous interval
          pingIntervalId = setInterval(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              console.log('Sending ping');
              wsRef.current.send(JSON.stringify({ type: 'ping' }));
            } else {
              console.log('Ping interval: WebSocket not open, clearing interval.');
              clearInterval(pingIntervalId);
              pingIntervalId = null;
            }
          }, 30000);
        };

        wsInstance.onmessage = (event) => {
          // Log message *before* checking activity/instance match
          console.log('[Raw WS Message]:', event.data);
          if (!isActive || wsInstance !== wsRef.current) {
            console.log("onmessage: Instance mismatch or effect inactive. Ignoring.");
            return;
          }
          // Proceed with parsing and state updates...
          try {
            const data = JSON.parse(event.data);
            console.log('Parsed WebSocket data:', data);
            switch (data.type) {
              case 'connection_established':
                console.log('Server confirmed connection:', data.message);
                if (data.initial_state) {
                  console.log('Received initial order book state:', data.initial_state);
                  // Sort initial state before setting
                  const initialBids = (data.initial_state.bids || []).sort((a, b) => b.price - a.price);
                  const initialAsks = (data.initial_state.asks || []).sort((a, b) => a.price - b.price);
                  setBids(initialBids);
                  setAsks(initialAsks);
                  logStateChange('bids', initialBids);
                  logStateChange('asks', initialAsks);
                }
                break;
              case 'order_book_update':
                console.log('Updating order book with new data:', data.data);
                // Ensure bids/asks are sorted correctly after update
                const newBids = (data.data.bids || []).sort((a, b) => b.price - a.price);
                const newAsks = (data.data.asks || []).sort((a, b) => a.price - b.price);
                console.log('New bids:', newBids);
                console.log('New asks:', newAsks);
                setBids(newBids);
                setAsks(newAsks);
                logStateChange('bids', newBids);
                logStateChange('asks', newAsks);
                
                if (data.trades && data.trades.length > 0) {
                  console.log('New trades from order:', data.trades);
                  setLastTrades(prevTrades => 
                     [...data.trades, ...prevTrades].slice(0, 15)
                  );
                   logStateChange('lastTrades', data.trades);
                }
                break;
              case 'pong':
                console.log('Received pong response');
                break;
              default:
                console.warn('Unknown message type received:', data.type);
            }
          } catch (e) {
            console.error('Error parsing WebSocket message:', e);
          }
        };

        wsInstance.onerror = (event) => {
          // Error events often precede close events. Log it, but handle state in onclose.
          if (!isActive || wsInstance !== wsRef.current) {
             console.log("onerror: Instance mismatch or effect inactive. Ignoring.");
             return;
          }
          console.error('onerror: WebSocket error occurred.'); // Keep it simple, details in console
           // Avoid setting state here as onclose will handle it
        };

        wsInstance.onclose = (event) => {
           if (!isActive || wsInstance !== wsRef.current) {
             console.log("onclose: Instance mismatch or effect inactive. Ignoring.");
             return;
           }
          console.log(`onclose: WebSocket connection closed: Code=${event.code}, Reason='${event.reason}', Clean=${event.wasClean}`);
          
          if (pingIntervalId) clearInterval(pingIntervalId);
          pingIntervalId = null;
          // Important: Clear the ref *only if* it still points to this closing instance
          if (wsRef.current === wsInstance) {
              wsRef.current = null;
              console.log("onclose: wsRef cleared.");
          }

          // Only attempt reconnect if the close was unexpected or is a standard closure code we want to retry
          if (isActive && event.code !== 1000 /* Normal Closure */ && reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current += 1;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current - 1), 30000);
            console.log(`onclose: Attempting to reconnect in ${delay}ms...`);
            if (connectTimeoutId) clearTimeout(connectTimeoutId); // Clear previous timeout if any
            connectTimeoutId = setTimeout(connect, delay); // Schedule reconnect
          } else if (event.code !== 1000) {
            console.error('onclose: Max reconnection attempts reached or non-retriable close.');
            setError('WebSocket connection lost. Please refresh.');
            setIsLoading(false); // Stop loading only after max attempts or non-retriable close
          } else {
              // Normal closure (code 1000), likely from cleanup
              console.log('onclose: Normal closure (1000), not reconnecting.');
              setIsLoading(false); // Ensure loading is false on normal close
          }
        };

      } catch (e) {
        console.error('Error creating WebSocket:', e);
        setError(`Failed to create WebSocket: ${e.message}`);
        setIsLoading(false); // Stop loading if creation fails
        wsRef.current = null; // Ensure ref is clear on creation error
      }
    };

    connect(); // Initial connection attempt

    // Return the cleanup function
    return cleanup;
  }, []); // Empty dependency array

  // Handle Order Submission (passed to OrderEntryForm)
  const handlePlaceOrderSubmit = useCallback(async (client, sideInt, price, volume) => {
    if (!API_URL) {
      setError("API URL not configured.");
      throw new Error("API URL not configured.");
    }
    const orderData = { client, side: sideInt, price, volume };
    console.log("App sending order:", orderData);
    setError(null); // Clear previous errors on new action

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
      // Rely on WebSocket for state updates
      return result; 
    } catch (e) {
       console.error("Error submitting order:", e);
       setError(e.message || "Failed to submit order.");
       throw e; // Re-throw for the form to handle
    }
  }, []);

  return (
    <div className="App">
      <h1>LOB Simulator & Chart</h1>
      {/* Display general errors prominently */} 
      {error && <p className="error-text app-error">Error: {error}</p>}
      <div className="main-container">
        <div className="chart-container">
          {/* Pass price history and loading state to chart */}
          <SimulatorChart 
             priceHistory={priceHistory} 
             isLoading={isLoading} 
             // Chart doesn't need separate error prop if using main loading state
             error={null} 
           />
        </div>
        <div className="lob-trade-container">
          {/* Pass loading and error state to OrderBookDisplay */}
          <OrderBookDisplay 
             bids={bids} 
             asks={asks} 
             isLoading={isLoading} // Use the unified loading state
             error={error} // Use the unified error state
           />
          <OrderEntryForm handlePlaceOrder={handlePlaceOrderSubmit} />
          <RecentTrades trades={lastTrades} />
        </div>
      </div>
    </div>
  );
}

export default App;