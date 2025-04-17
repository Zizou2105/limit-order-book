import React, { useState } from 'react';

// Assume handlePlaceOrder comes from props: handlePlaceOrder(client, sideInt, price, volume)
function OrderEntryForm({ handlePlaceOrder }) {
  const [client, setClient] = useState('ReactClient');
  const [side, setSide] = useState('BUY'); // Store "BUY" or "SELL" string
  const [price, setPrice] = useState('100.00');
  const [volume, setVolume] = useState('10');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(''); // For success/error messages

  const onSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(''); // Clear previous status

    const parsedPrice = parseFloat(price);
    const parsedVolume = parseInt(volume, 10);
    const sideInteger = side === 'BUY' ? 1 : 2; // Convert to int for API

    if (isNaN(parsedPrice) || isNaN(parsedVolume) || parsedVolume <= 0 || parsedPrice <= 0) {
      setSubmitStatus("Error: Invalid positive price and volume.");
      setIsSubmitting(false);
      return;
    }

    try {
      // Call the handler passed from App.jsx
      await handlePlaceOrder(client, sideInteger, parsedPrice, parsedVolume);
      setSubmitStatus('Order submitted successfully!');
      // Optionally clear form fields here
      // setPrice('100.00');
      // setVolume('10');
    } catch (error) {
      console.error("Form submission error:", error);
      setSubmitStatus(`Error: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="order-entry-widget">
      <h3>Trade</h3>
      {/* Add Limit/Market tabs if needed - keep simple for now */}
      <form onSubmit={onSubmit}>
        <div className="form-group">
          <label htmlFor="client">Client:</label>
          <input id="client" type="text" value={client} onChange={(e) => setClient(e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor="side">Side:</label>
          <select id="side" value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="price">Price:</label>
          <input id="price" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor="volume">Volume:</label>
          <input id="volume" type="number" step="1" value={volume} onChange={(e) => setVolume(e.target.value)} required />
        </div>
        <button type="submit" disabled={isSubmitting} className={`submit-button ${side.toLowerCase()}`}>
          {isSubmitting ? 'Placing...' : `${side}`}
        </button>
        {submitStatus && <p className={`submit-status ${submitStatus.startsWith('Error') ? 'error' : 'success'}`}>{submitStatus}</p>}
      </form>
    </div>
  );
}

export default OrderEntryForm;