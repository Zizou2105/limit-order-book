import React from 'react';

function RecentTrades({ trades }) {
  // Helper to format timestamp (optional, can improve)
  const formatTimestamp = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  return (
    <div className="recent-trades-widget">
      <h3>Recent Activity</h3>
      {trades.length === 0 ? (
        <p className="no-trades">No recent trades recorded.</p>
      ) : (
        <ul className="trade-list">
          {trades.map((trade, index) => (
            <li key={`trade-${index}-${trade.timestamp}`} className="trade-item">
              <span className="trade-time">{formatTimestamp(trade.timestamp)}</span>
              <span className="trade-details">
                  Trade: 
                  <span className="trade-volume">{trade.volume}</span> shares @ 
                  <span className="trade-price">{trade.price.toFixed(2)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default RecentTrades;