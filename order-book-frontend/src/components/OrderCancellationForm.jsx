import React, { useState } from 'react';

function OrderCancellationForm({ handleCancelOrder }) {
  const [orderId, setOrderId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('');

    const parsedOrderId = parseInt(orderId, 10);

    if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
      setSubmitStatus("Error: Invalid order ID.");
      setIsSubmitting(false);
      return;
    }

    try {
      await handleCancelOrder(parsedOrderId);
      setSubmitStatus('Order cancelled successfully!');
      setOrderId(''); // Clear the input after successful cancellation
    } catch (error) {
      console.error("Cancellation error:", error);
      setSubmitStatus(`Error: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="order-cancellation-widget">
      <h3>Cancel Order</h3>
      <form onSubmit={onSubmit}>
        <div className="form-group">
          <label htmlFor="orderId">Order ID:</label>
          <input
            id="orderId"
            type="number"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="Enter order ID"
            required
          />
        </div>
        <button type="submit" disabled={isSubmitting} className="submit-button cancel">
          {isSubmitting ? 'Cancelling...' : 'Cancel Order'}
        </button>
        {submitStatus && (
          <p className={`submit-status ${submitStatus.startsWith('Error') ? 'error' : 'success'}`}>
            {submitStatus}
          </p>
        )}
      </form>
    </div>
  );
}

export default OrderCancellationForm; 