// src/App.jsx
import React, { useState, useEffect, useCallback } from 'react';
import SimulatorChart from './components/SimulatorChart'; // Uses Lightweight Charts now
import OrderBookDisplay from './components/OrderBookDisplay';
import OrderEntryForm from './components/OrderEntryForm';
import RecentTrades from './components/RecentTrades';
import './App.css'; // Your main CSS

// Ensure fallback works if ENV var isn't set during local dev
const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function App() {
  const [bids, setBids] = useState([]);
  const [asks, setAsks] = useState([]);
  const [lastTrades, setLastTrades] = useState([]);
  const [isLoadingLob, setIsLoadingLob] = useState(false); // Separate loading for LOB
  const [lobError, setLobError] = useState(null);

  // Fetch LOB Data
  const fetchLob = useCallback(async () => {
    if (!API_URL) {
      setLobError("API URL not configured.");
      return;
    }
    // setIsLoadingLob(true); // Avoid setting loading on every poll
    try {
      const response = await fetch(`${API_URL}/lob?levels=15`);
      if (!response.ok) {
         let errorDetail = `LOB Fetch failed: ${response.status}`;
         try { const ed = await response.json(); errorDetail = ed.detail || errorDetail; } catch(e){}
        throw new Error(errorDetail);
      }
      const data = await response.json();
      setBids(data.bids || []);
      setAsks(data.asks || []);
      if(lobError) setLobError(null); // Clear error on successful fetch
    } catch (e) {
      console.error("Failed to fetch LOB:", e);
      setLobError(e.message);
    } finally {
      // setIsLoadingLob(false);
    }
  }, [lobError]); // Include lobError

  // Initial LOB fetch and interval
  useEffect(() => {
    setIsLoadingLob(true);
    fetchLob().finally(() => setIsLoadingLob(false));
    const intervalId = setInterval(fetchLob, 3000); // Poll every 3 seconds
    return () => clearInterval(intervalId);
  }, [fetchLob]);

  // Handle Order Submission (passed to OrderEntryForm)
  const handlePlaceOrderSubmit = useCallback(async (client, sideInt, price, volume) => {
    // This function remains largely the same as before
    // It throws an error on failure, which the form component should catch
    if (!API_URL) {
      throw new Error("API URL not configured.");
    }
    const orderData = { client, side: sideInt, price, volume };
    console.log("App sending order:", orderData);

    const response = await fetch(`${API_URL}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData),
    });

    const result = await response.json(); // Get JSON body regardless of status
    if (!response.ok) {
      console.error("API Error Response on POST:", result);
      throw new Error(result.detail || `Order placement failed: ${response.status}`);
    }

    console.log("App received order result:", result);
    if (result.trades_executed && result.trades_executed.length > 0) {
      setLastTrades(prev => [...result.trades_executed, ...prev].slice(0, 15));
    }
    // Optionally trigger immediate LOB/Chart refresh
    // fetchLob(); // Consider implications of rapid refreshes

    return result; // Return success result to form
  }, []); // Removed fetchLob dependency unless immediate refresh needed

  return (
    <div className="App">
      <h1>LOB Simulator & Chart</h1>
      <div className="main-container">
        <div className="chart-container">
          {/* Use the Lightweight Charts component */}
          <SimulatorChart />
        </div>
        <div className="lob-trade-container">
          <OrderBookDisplay bids={bids} asks={asks} isLoading={isLoadingLob} error={lobError} />
          <OrderEntryForm handlePlaceOrder={handlePlaceOrderSubmit} />
          <RecentTrades trades={lastTrades} />
        </div>
      </div>
    </div>
  );
}

export default App;