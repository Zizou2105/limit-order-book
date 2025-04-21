import React from 'react';

function ClientOrders({ client, orders, onCancelOrder }) {
  if (!orders || orders.length === 0) {
    return (
      <div className="client-orders-widget">
        <h3>My Orders</h3>
        <p className="no-orders">No active orders</p>
      </div>
    );
  }

  return (
    <div className="client-orders-widget">
      <h3>My Orders</h3>
      <div className="orders-table-container">
        <table>
          <thead>
            <tr>
              <th>Side</th>
              <th>Price</th>
              <th>Volume</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.order_id}>
                <td className={`side-${order.side.toLowerCase()}`}>{order.side}</td>
                <td>{order.price.toFixed(2)}</td>
                <td>
                  {order.originalVolume ? (
                    <span className="volume-info">
                      {order.volume} / {order.originalVolume}
                    </span>
                  ) : (
                    order.volume
                  )}
                </td>
                <td>
                  <button 
                    className="cancel-order-button"
                    onClick={() => onCancelOrder(order.order_id)}
                  >
                    Cancel
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ClientOrders; 