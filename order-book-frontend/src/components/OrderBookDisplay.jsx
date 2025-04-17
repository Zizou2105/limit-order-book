import React from 'react';

function OrderBookDisplay({ bids, asks, isLoading, error }) {
  if (isLoading) return <p className="loading-text">Loading Order Book...</p>;
  if (error) return <p className="error-text">Error loading Order Book: {error}</p>;

  // Function to render rows for bid/ask tables
  const renderRows = (orders, side) => {
    // Sort asks low to high, bids high to low for display
    const sortedOrders = [...orders]; // Create a copy to sort
    if (side === 'asks') {
      sortedOrders.sort((a, b) => a.price - b.price); // Lowest price first
    } else {
      sortedOrders.sort((a, b) => b.price - a.price); // Highest price first
    }

    // Limit the number of rows displayed if needed
    const displayOrders = sortedOrders.slice(0, 15); // Show top 15 levels

    // For asks, we want lowest price near middle, so reverse the sorted low-to-high array for display
    const finalDisplayOrder = side === 'asks' ? displayOrders.reverse() : displayOrders;


    return finalDisplayOrder.map((order, index) => (
        // Ensure NO WHITESPACE or newlines directly inside <tr> before the first <td>
        <tr key={`${side}-${index}-${order.price}`}>
          <td className={`price-${side === 'bids' ? 'bid' : 'ask'}`}>
            {order.price.toFixed(2)}
          </td>
          <td>{order.volume}</td>
          <td>{(order.price * order.volume).toFixed(2)}</td>
        </tr> // <-- Make sure no space or text comes after the closing </tr> either before the next map iteration
      ));
  };


  return (
    <div className="lob-widget">
      <h3>Order Book</h3>
      <div className="lob-columns">
        <div className="lob-asks">
          <table>
            <thead>
              <tr>
                <th>Price (USD)</th>
                <th>Amount</th>
                <th>Total (USD)</th>
              </tr>
            </thead>
            <tbody>
                {asks.length > 0 ? renderRows(asks, 'asks') : <tr><td colSpan="3">No asks</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="lob-bids">
          <table>
            <thead>
              <tr>
                <th>Price (USD)</th>
                <th>Amount</th>
                <th>Total (USD)</th>
              </tr>
            </thead>
            <tbody>
                {bids.length > 0 ? renderRows(bids, 'bids') : <tr><td colSpan="3">No bids</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default OrderBookDisplay;