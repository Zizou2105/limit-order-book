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
    datasets: [
      {
        label: 'Mid Price',
        data: [],
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.1)',
        tension: 0.1,
        pointRadius: 1,
        fill: true,
        yAxisID: 'y',
      },
      {
        label: 'Trade Price',
        data: [],
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.1)',
        tension: 0.1,
        pointRadius: 3,
        fill: false,
        yAxisID: 'y',
      }
    ]
  });

  // Effect to update chart when priceHistory prop changes
  useEffect(() => {
    if (!priceHistory || priceHistory.length === 0) {
      setChartData(prevData => ({
        ...prevData,
        datasets: [
          { ...prevData.datasets[0], data: [] },
          { ...prevData.datasets[1], data: [] }
        ]
      }));
      return;
    }

    // Format data for Chart.js: {x: timestamp_ms, y: price}
    const formattedData = priceHistory.map(point => ({
      x: point.timestamp,
      y: point.price
    })).sort((a, b) => a.x - b.x);

    // Extract trade prices from priceHistory
    const tradeData = priceHistory
      .filter(point => point.isTrade)
      .map(point => ({
        x: point.timestamp,
        y: point.price
      }));

    setChartData(prevData => ({
      ...prevData,
      datasets: [
        {
          ...prevData.datasets[0],
          data: formattedData
        },
        {
          ...prevData.datasets[1],
          data: tradeData
        }
      ]
    }));

  }, [priceHistory]);

  // Chart.js Options Configuration
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
        labels: { 
          color: '#d1d4dc',
          font: {
            size: 12
          }
        }
      },
      title: {
        display: true,
        text: 'Price History',
        color: '#eceff1',
        font: {
          size: 16
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(30, 34, 45, 0.9)',
        titleColor: '#eceff1',
        bodyColor: '#d1d4dc',
        borderColor: '#444',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              }).format(context.parsed.y);
            }
            return label;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'minute',
          tooltipFormat: 'PP pp',
          displayFormats: {
            second: 'HH:mm:ss',
            minute: 'HH:mm',
            hour: 'HH:00',
            day: 'MMM d'
          }
        },
        ticks: { 
          color: '#848e9c', 
          source: 'auto', 
          maxRotation: 0, 
          autoSkip: true, 
          autoSkipPadding: 20 
        },
        grid: { 
          color: 'rgba(255, 255, 255, 0.1)',
          drawBorder: false
        }
      },
      y: {
        ticks: { 
          color: '#848e9c',
          callback: function(value) {
            return new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }).format(value);
          }
        },
        grid: { 
          color: 'rgba(255, 255, 255, 0.1)',
          drawBorder: false
        }
      }
    },
    parsing: false,
    normalized: true,
  };

  return (
    <div className="simulator-chart-widget">
      {error && <p className="error-text">Chart Error: {error}</p>}
      <div className="chart-target-container">
        {isLoading ? (
          <div className="chart-loading-overlay"><p>Loading Chart Data...</p></div>
        ) : (
          <Line ref={chartRef} options={options} data={chartData} />
        )}
      </div>
    </div>
  );
}

export default React.memo(SimulatorChart);