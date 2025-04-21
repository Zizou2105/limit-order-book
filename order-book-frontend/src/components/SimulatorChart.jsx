// src/components/SimulatorChart.jsx
import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';
import 'chartjs-adapter-date-fns';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

const SimulatorChart = ({ priceHistory, isLoading, error }) => {
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [
      {
        label: 'Mid Price',
        data: [],
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0
      },
      {
        label: 'Trades',
        data: [],
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        borderWidth: 2,
        pointRadius: 4,
        pointStyle: 'circle',
        tension: 0,
        showLine: true
      }
    ]
  });

  useEffect(() => {
    if (!priceHistory || priceHistory.length === 0) return;

    const midPriceData = priceHistory
      .filter(point => !point.isTrade)
      .map(point => ({
        x: new Date(point.timestamp),
        y: point.price
      }));

    const tradeData = priceHistory
      .filter(point => point.isTrade)
      .map(point => ({
        x: new Date(point.timestamp),
        y: point.price
      }));

    setChartData(prevData => ({
      ...prevData,
      datasets: [
        {
          ...prevData.datasets[0],
          data: midPriceData
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
    animation: {
      duration: 0 // Disable animations for better performance
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    },
    plugins: {
      legend: {
        position: 'top',
        align: 'center',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12
          }
        }
      },
      title: {
        display: true,
        text: 'Price History',
        padding: {
          top: 10,
          bottom: 20
        },
        font: {
          size: 16,
          weight: 'bold'
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'second',
          displayFormats: {
            second: 'HH:mm:ss'
          }
        },
        grid: {
          display: true,
          drawBorder: true,
          drawOnChartArea: true,
          drawTicks: true,
          color: 'rgba(0, 0, 0, 0.1)'
        },
        ticks: {
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 10,
          padding: 10
        }
      },
      y: {
        position: 'right',
        grid: {
          display: true,
          drawBorder: true,
          drawOnChartArea: true,
          drawTicks: true,
          color: 'rgba(0, 0, 0, 0.1)'
        },
        ticks: {
          padding: 10,
          callback: function(value) {
            return '$' + value.toFixed(2);
          }
        }
      }
    }
  };

  if (isLoading) {
    return <div>Loading chart...</div>;
  }

  if (error) {
    return <div>Error loading chart: {error}</div>;
  }

  return (
    <div style={{ width: '100%', height: '400px', padding: '20px' }}>
      <Line data={chartData} options={options} />
    </div>
  );
};

export default SimulatorChart;