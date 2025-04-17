import React, { useState, useEffect, useCallback } from 'react';
import './App.css'; // Basic styling

const API_URL = import.meta.env.VITE_API_BASE_URL;

function App() {
    const [bids, setBids] = useState([]);
    const [asks, setAsks] = useState([]);
    const [lastTrades, setLastTrades] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Form state
    const [client, setClient] = useState('ReactClient');
    const [side, setSide] = useState('1');
    const [price, setPrice] = useState('100.00');
    const [volume, setVolume] = useState('10');

    const fetchLob = useCallback(async () => {
        if (!API_URL) {
             setError("API URL not configured in environment variables.");
             return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_URL}/lob?levels=10`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setBids(data.bids || []);
            setAsks(data.asks || []);
        } catch (e) {
            console.error("Failed to fetch LOB:", e);
            setError(`Failed to fetch data: ${e.message}`);
            setBids([]);
            setAsks([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLob();
        const intervalId = setInterval(fetchLob, 3000);

        return () => clearInterval(intervalId);
    }, [fetchLob]);

    const handlePlaceOrder = async (e) => {
        e.preventDefault();
         if (!API_URL) {
             alert("API URL not configured.");
             return;
        }
        
        const orderData = {
            client,
            side: parseInt(side, 10),
            price: parseFloat(price),
            volume: parseInt(volume, 10),
        };

        if (isNaN(orderData.price) || isNaN(orderData.volume) || orderData.volume <= 0 || orderData.price <= 0) {
            alert("Please enter valid positive price and volume.");
            return;
        }

        console.log("Submitting order:", orderData);
        try {
            const response = await fetch(`${API_URL}/order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(orderData),
            });
            const result = await response.json();
            if (!response.ok) {
                const errorMessage = result.detail || (typeof result === 'object' ? JSON.stringify(result) : `HTTP error ${response.status}`);
                throw new Error(errorMessage);
            }
            console.log("Order placement result:", result);
            alert(`Order ${result.order_id || 'partially/fully'} placed. Trades: ${result.trades_executed?.length || 0}`);
            
            setLastTrades(prev => [...(result.trades_executed || []), ...prev].slice(0, 10)); // Show last 10
            
        } catch (error) {
            console.error("Order placement failed:", error);
            alert(`Order placement failed: ${error.message}`);
        }
    };

    return (
        <div className="App">
            <h1>Limit Order Book</h1>
            {error && <p className="error">Error: {error}</p>}
            {isLoading && <p>Loading...</p>}

            <div className="lob-container">
                <div className="lob-side asks">
                    <h2>Asks (Sell Orders)</h2>
                    <table>
                        <thead><tr><th>Price</th><th>Volume</th></tr></thead>
                        <tbody>
                            {/* Asks sorted low to high */}
                            {asks.slice().reverse().map((ask, index) => (
                                <tr key={`ask-${index}`}><td>{ask.price.toFixed(2)}</td><td>{ask.volume}</td></tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="lob-side bids">
                    <h2>Bids (Buy Orders)</h2>
                     <table>
                        <thead><tr><th>Price</th><th>Volume</th></tr></thead>
                        <tbody>
                            {/* Bids sorted high to low */}
                            {bids.map((bid, index) => (
                                <tr key={`bid-${index}`}><td>{bid.price.toFixed(2)}</td><td>{bid.volume}</td></tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

             <div className="order-entry">
                 <h2>Place Order</h2>
                 <form onSubmit={handlePlaceOrder}>
                     <div>
                         <label>Client: </label>
                         <input type="text" value={client} onChange={(e) => setClient(e.target.value)} required />
                     </div>
                     <div>
                         <label>Side: </label>
                         <select value={side} onChange={(e) => setSide(e.target.value)}>
                             <option value="1">BUY</option>
                             <option value="2">SELL</option>
                         </select>
                     </div>
                     <div>
                         <label>Price: </label>
                         <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
                     </div>
                     <div>
                         <label>Volume: </label>
                         <input type="number" step="1" value={volume} onChange={(e) => setVolume(e.target.value)} required />
                     </div>
                     <button type="submit">Place Order</button>
                 </form>
             </div>

             <div className="trade-log">
                 <h2>Recent Trades (from order placement)</h2>
                 <ul>
                     {lastTrades.map((trade, index) => (
                         <li key={`trade-${index}`}>{trade}</li>
                     ))}
                 </ul>
             </div>
        </div>
    );
}

export default App;