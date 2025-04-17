// src/components/SimulatorChart.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import 'chartjs-adapter-date-fns';

// Register Chart.js components
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

// Accept priceHistory, isLoading, error as props
function SimulatorChart({ priceHistory, isLoading, error }) {
  const chartRef = useRef(null); // Ref to access the chart instance

  // State for the data structure Chart.js expects
  const [chartData, setChartData] = useState({
    datasets: [{
        label: 'Live Mid Price', // Updated label
        data: [], // Initialize with empty data array, now {x: timestamp, y: price}
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.1)',
        tension: 0.1,
        pointRadius: 1,
        fill: true,
      }]
  });

  // Effect to update chart when priceHistory prop changes
  useEffect(() => {
    if (!priceHistory || priceHistory.length === 0) {
      // Optionally clear the chart if history is empty or reset
      setChartData(prevData => ({
        ...prevData,
        datasets: [{ ...prevData.datasets[0], data: [] }]
      }));
      return;
    }

    // Format data for Chart.js: {x: timestamp_ms, y: price}
    // Assuming priceHistory is already in this format [{timestamp: number, price: number}]
    const formattedData = priceHistory.map(point => ({
      x: point.timestamp,
      y: point.price
    })).sort((a, b) => a.x - b.x); // Ensure sorted by timestamp

    setChartData(prevData => ({
        ...prevData,
        datasets: [{
            ...prevData.datasets[0],
            data: formattedData
        }]
    }));

    // Optional: Update chart instance directly for smoother updates if needed
    // if (chartRef.current) {
    //   chartRef.current.update('none'); // 'none' prevents animation
    // }

  }, [priceHistory]); // Re-run effect when priceHistory prop changes

  // Chart.js Options Configuration (mostly unchanged, adjusted title)
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // Keep animation off for potential frequent updates
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#d1d4dc' }
      },
      title: {
        display: true,
        text: 'Live Price Activity (Mid-Price)', // Updated title
        color: '#eceff1'
      },
      tooltip: {
        mode: 'index', // Show tooltip for points at the same index (timestamp)
        intersect: false,
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
           unit: 'minute', // Adjust unit based on expected data frequency
           tooltipFormat: 'PP pp',
           displayFormats: {
               second: 'HH:mm:ss',
               minute: 'HH:mm',
               hour: 'HH:00',
               day: 'MMM d'
           }
        },
        ticks: { color: '#848e9c', source: 'auto', maxRotation: 0, autoSkip: true, autoSkipPadding: 20 },
        grid: { color: 'rgba(255, 255, 255, 0.1)' }
      },
      y: {
        ticks: { color: '#848e9c' },
        grid: { color: 'rgba(255, 255, 255, 0.1)' }
      }
    },
    parsing: false, // Data is already parsed into {x, y}
    normalized: true, // Assume data is sorted
  };

  return (
    <div className="simulator-chart-widget">
      {/* Removed internal H3 title, using chart title plugin */}
      {error && <p className="error-text">Chart Error: {error}</p>}
      <div className="chart-target-container">
        {isLoading ? (
          <div className="chart-loading-overlay"><p>Loading Chart Data...</p></div>
        ) : (
          // Pass ref to the Line component
          <Line ref={chartRef} options={options} data={chartData} />
        )}
      </div>
    </div>
  );
}

export default React.memo(SimulatorChart); // Use memo since props might change frequently