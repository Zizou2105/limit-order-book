// src/components/SimulatorChart.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Line } from 'react-chartjs-2'; // Import Line chart component
import {
  Chart as ChartJS, // ChartJS instance for registration
  CategoryScale,
  LinearScale,
  TimeScale,    // Use TimeScale for x-axis
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler // For area fill
} from 'chart.js';
import 'chartjs-adapter-date-fns'; // Import the adapter for TimeScale
// Optionally import locale if needed for date-fns formatting
// import { enUS } from 'date-fns/locale';

// Register Chart.js components we are using
ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function SimulatorChart() {
  // State for the data structure Chart.js expects
  const [chartData, setChartData] = useState({
    datasets: [{
        label: 'Simulated Mid Price',
        data: [], // Initialize with empty data array
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.1)',
        tension: 0.1,
        pointRadius: 1,
        fill: true,
      }]
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch history data function - mostly the same
  const fetchHistory = useCallback(async () => {
    if (!API_URL) {
      setError("API URL not configured.");
      return null;
    }
    try {
      const response = await fetch(`${API_URL}/price_history`);
      if (!response.ok) {
        let errorDetail = `History Fetch failed: ${response.status}`;
        try { const ed = await response.json(); errorDetail = ed.detail || errorDetail; } catch (e) {}
        throw new Error(errorDetail);
      }
      const data = await response.json();

      // Format data for Chart.js time scale: array of {x: timestamp_ms, y: price}
      const formattedData = data.history.map(point => ({
        x: point.timestamp, // Use milliseconds timestamp directly for Chart.js TimeScale
        y: point.price
      })).sort((a, b) => a.x - b.x); // Sort by timestamp (x-value)

      setError(null);
      return formattedData;
    } catch (e) {
      console.error("Failed to fetch price history:", e);
      setError(e.message);
      return null;
    }
  }, []);

  // Effect for initial load and interval updates
  useEffect(() => {
    let isMounted = true; // Prevent state update on unmounted component

    const updateChartData = async () => {
        const fetchedData = await fetchHistory();
        if (isMounted && fetchedData) {
            setChartData(prevData => ({
                ...prevData, // Keep existing dataset configuration
                datasets: [{
                    ...prevData.datasets[0], // Keep existing dataset config
                    data: fetchedData // Update the data array
                }]
            }));
        }
    };

    setIsLoading(true);
    updateChartData().finally(() => {
        if (isMounted) setIsLoading(false);
    }); // Initial fetch

    const intervalId = setInterval(updateChartData, 5000); // Update every 5 seconds

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    }; // Cleanup interval
  }, [fetchHistory]); // Dependency

  // Chart.js Options Configuration
  const options = {
    responsive: true, // Make chart responsive to container size
    maintainAspectRatio: false, // Allow chart to fill container height correctly
    animation: false, // Disable animation for faster updates (optional)
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#d1d4dc' }
      },
      title: {
        display: true,
        text: 'Simulated Price Activity (Mid-Price)',
        color: '#eceff1'
      },
      tooltip: {
        // Tooltip customization can be added here if needed
      }
    },
    scales: {
      x: { // Configure X axis (Time)
        type: 'time',
        time: {
          // Choose appropriate unit based on data density/range
          unit: 'minute',
           parser: 'T', // Use default parser for epoch milliseconds
           tooltipFormat: 'PP pp', // Example: Apr 17, 2024, 9:30:00 PM
           displayFormats: { // How labels look on the axis
               second: 'HH:mm:ss',
               minute: 'HH:mm',
               hour: 'HH:00',
               day: 'MMM d'
           }
        },
        ticks: { color: '#848e9c', source: 'auto', maxRotation: 0, autoSkip: true, autoSkipPadding: 20 },
        grid: { color: 'rgba(255, 255, 255, 0.1)' }
      },
      y: { // Configure Y axis (Price)
        ticks: { color: '#848e9c' },
        grid: { color: 'rgba(255, 255, 255, 0.1)' }
      }
    },
    // Optimize performance for real-time data (optional)
    parsing: false, // Data is already parsed into {x, y}
    normalized: true, // Assume data is sorted (we sorted it)
  };

  return (
    <div className="simulator-chart-widget">
      <h3>Simulated Price Activity (Mid-Price)</h3>
      {error && <p className="error-text">Chart Error: {error}</p>}
      <div className="chart-target-container">
        {isLoading ? (
          <div className="chart-loading-overlay"><p>Loading Chart Data...</p></div>
        ) : (
          // Render the Line component from react-chartjs-2
          <Line options={options} data={chartData} />
        )}
      </div>
    </div>
  );
}

export default SimulatorChart; // memo is less critical here due to polling