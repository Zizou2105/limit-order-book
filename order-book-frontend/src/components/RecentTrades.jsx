import React from 'react';

function RecentTrades({ trades }) {
  return (
    <div className="recent-trades-widget">
      <h3>Recent Activity</h3>
      {trades.length === 0 ? (
        <p>No recent trades recorded from form submissions.</p>
      ) : (
        <ul>
          {trades.map((trade, index) => (
            <li key={`trade-${index}`}>{trade}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default RecentTrades;