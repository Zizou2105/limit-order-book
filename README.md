# Limit Order Book (LOB) Simulator

This project implements a simplified Limit Order Book (LOB) simulation using a Python FastAPI backend and a React frontend. It aims to model the core mechanics of an electronic trading matching engine, including order placement, price-time priority matching, and order cancellation. A background simulator task continuously interacts with the order book to provide dynamic activity.

This project was built as a learning exercise to understand fundamental trading system concepts, data structures, API design, and deployment practices relevant to roles in financial technology, such as Application/Trading Systems Analyst.

## Features

*   **Limit Order Placement:** Submit BUY and SELL limit orders with price and volume.
*   **Order Matching Engine:** Matches incoming orders against resting orders in the book based on Price-Time Priority.
*   **Price Priority:** Buyers match against the lowest asks; Sellers match against the highest bids.
*   **Time Priority (FIFO):** Orders at the same price level are matched based on their arrival time (First-In, First-Out), handled using queues per price level.
*   **Order Cancellation:** Remove active (partially or unfilled) orders from the book.
*   **Real-time LOB Snapshot:** API endpoint (`/lob`) provides aggregated volume data for the top N price levels.
*   **Background Simulator:** An `asyncio` task runs within the backend service, placing random orders and occasionally cancelling existing ones to simulate market activity.
*   **React Frontend:** Simple web interface to visualize the order book (bids/asks), submit new orders, and view recent trades triggered by user actions.
*   **FastAPI Backend:** Provides a RESTful API for interaction and includes automatic Swagger UI documentation.

## Tech Stack

**Backend:**
*   Python 3.10+
*   FastAPI: Modern, high-performance web framework for building APIs.
*   Uvicorn: ASGI server to run the FastAPI application.
*   Pydantic: Data validation and settings management (used by FastAPI).
*   Standard Libraries: `heapq`, `collections.deque`, `datetime`, `logging`, `asyncio`, `random`, `os`.
*   `httpx`: (If using the HTTP-based simulator - currently using direct calls).

**Frontend:**
*   React (using Vite for setup)
*   JavaScript (ES6+)
*   HTML5 / CSS3
*   Fetch API: For making requests to the backend.

**Deployment:**
*   Backend: Render (Free Tier Web Service)
*   Frontend: Vercel (Free Tier Hobby Plan)
*   Version Control: Git / GitHub

## Project Structure

OrderBookGoogle/
├── order_book_logic.py # Core OrderBook, Order, Side class definitions and logic
├── main.py # FastAPI application, API endpoints, simulator task, lifespan manager
├── requirements.txt # Python dependencies for the backend
├── Procfile # Defines process types for deployment (e.g., Render)
│
└── order-book-frontend/ # React frontend application (separate directory)
├── public/
├── src/
├── .env.local # <-- IMPORTANT: Configure API URL here for frontend
├── package.json
└── vite.config.js # (Or relevant config for CRA)
└── ... (other frontend files)

## Setup and Installation

**Prerequisites:**
*   Python 3.10+
*   Node.js and npm (or yarn) for the frontend
*   Git

**Backend Setup:**

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd OrderBookGoogle
    ```
2.  **Create and activate a virtual environment (recommended):**
    ```bash
    python3 -m venv venv
    source venv/bin/activate  # On Windows use `venv\Scripts\activate`
    ```
3.  **Install dependencies:**
    ```bash
    python3 -m pip install -r requirements.txt
    ```

**Frontend Setup:**

1.  **Navigate to the frontend directory:**
    ```bash
    cd order-book-frontend
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    # or: yarn install
    ```
3.  **Configure API URL:**
    *   Create a file named `.env.local` in the `order-book-frontend` directory.
    *   Add the following line, replacing the URL with your **local** or **deployed backend** URL:
        ```.env.local
        # For Vite (default)
        VITE_API_BASE_URL=http://127.0.0.1:8000

        # OR if using Create React App
        # REACT_APP_API_BASE_URL=http://127.0.0.1:8000
        ```
        *(Use `http://127.0.0.1:8000` for local testing. Update this to your Render URL for the deployed frontend).*

## Running the Application

**1. Run the Backend API Server:**

*   Navigate to the root `OrderBookGoogle` directory in your terminal.
*   Make sure your virtual environment is activated.
*   Run Uvicorn:
    ```bash
    uvicorn main:app --reload --port 8000
    ```
    *   `--reload`: Enables auto-reloading on code changes (for development).
    *   The server will be available at `http://127.0.0.1:8000`.
    *   The background simulator task will start automatically. Check the terminal logs.
    *   Access interactive API documentation at `http://127.0.0.1:8000/docs`.

**2. Run the Frontend Development Server:**

*   Open a *new* terminal window.
*   Navigate to the `order-book-frontend` directory.
*   Run the development server:
    ```bash
    npm run dev
    # or for Create React App: npm start
    ```
*   Open your web browser to the address provided (usually `http://localhost:5173` or `http://localhost:3000`).
*   The frontend should connect to your locally running backend (make sure the URL in `.env.local` is correct).

## API Endpoints

*   **`GET /`**: Root endpoint, returns a welcome message.
*   **`GET /lob`**: Retrieves the order book snapshot.
    *   Query Parameter: `levels` (int, default: 5, min: 1, max: 50) - Number of price levels per side.
    *   Returns: JSON with `bids` and `asks` arrays, each containing objects like `{"price": float, "volume": int}`.
*   **`POST /order`**: Places a new limit order.
    *   Request Body: JSON matching `OrderRequest` model (`{"client": "...", "side": "BUY" | "SELL", "price": ..., "volume": ...}`).
    *   Returns: JSON matching `PlaceOrderResponse` model, including the assigned `order_id` and a list of strings describing any `trades_executed`. Status 201 on success.
*   **`DELETE /order/{order_id}`**: Attempts to cancel an order.
    *   Path Parameter: `order_id` (int).
    *   Returns: JSON matching `CancelOrderResponse` on success. Returns 404 if the order is not found or cannot be cancelled.

*(See `http://<your-backend-url>/docs` for detailed interactive documentation).*

## Design Choices & How it Works

*   **Core Data Structures:**
    *   **Heaps (`heapq`):** Two heaps (`bids_heap`, `asks_heap`) are used to efficiently access the best bid (highest price) and best ask (lowest price) in O(log N) time for additions/removals (though removal logic here is lazy at the heap level). Bids use negated prices to simulate a max-heap with Python's min-heap implementation.
    *   **Queues (`collections.deque`):** Each price level within the heaps points to a `deque`. Orders are added to the *end* of the deque and matched from the *front*, ensuring First-In, First-Out (FIFO) time priority for orders at the same price.
    *   **Hash Maps (Dictionaries):**
        *   `order_map`: Maps `order_id` to `Order` objects for O(1) average time lookup during cancellation.
        *   `queue_map`: Maps `(price, side)` to the corresponding `deque` object for O(1) average time access when adding/cancelling orders.
        *   `volume_map`: Maps `(price, side)` to the total *active* volume at that level for O(1) average time lookup (used by `/lob` endpoint and `get_best_bid/ask`). Updated during order placement, matching, and cancellation.
*   **Cancellation:** Implemented using *active removal from the queue*. When `cancel_order` is called, the order is found via `order_map`, removed from its `deque` (O(N) for deque, O(1) if using DLL optimization), the `volume_map` is decremented, and the order is removed from `order_map`. Empty price level queues are lazily removed from the *heap* when encountered by `get_best_bid/ask` or matching logic checking the `volume_map`.
*   **Simulator:** Runs as an `asyncio` background task started via FastAPI's `lifespan` manager. It directly calls `lob` methods to simulate activity.

## Deployment

*   **Backend:** Deployed on Render Free Tier: [https://<your-render-app-name>.onrender.com](https://<your-render-app-name>.onrender.com) *(Replace with your URL)*
*   **Frontend:** Deployed on Vercel Hobby Plan: [https://<your-vercel-app-name>.vercel.app](https://<your-vercel-app-name>.vercel.app) *(Replace with your URL)*

*(Note: Free tier services may "sleep" after periods of inactivity, requiring a short wake-up time on the first request after sleeping. The background simulator will also stop when the backend service sleeps).*

## Future Enhancements & TODOs

*   [ ] Implement Market Orders.
*   [ ] Implement Trigger Orders (Stop-Loss, Take-Profit) with separate tracking.
*   [ ] Optimize cancellation queue removal to O(1) using a Doubly Linked List implementation instead of `deque` and storing node references in `order_map`.
*   [ ] Implement active heap removal when a price level queue becomes empty during cancellation (requires finding the element in the heap, which is typically O(N) unless using more complex heap structures or pointers).
*   [ ] More sophisticated background simulator (e.g., weighted order types, different client behaviors).
*   [ ] Add more robust error handling and logging.
*   [ ] Implement WebSockets for real-time frontend updates instead of polling `/lob`.
*   [ ] Add persistence (e.g., save/load state to a file or simple database).
*   [ ] Performance profiling and optimization.
*   [ ] Consider a C++ implementation for performance comparison.
*   [ ] Add more comprehensive unit and integration tests.

## Learning Objectives & Relevance

This project provides hands-on experience with:
*   Core concepts of limit order books and exchange matching engines.
*   Designing and implementing stateful backend systems.
*   Choosing and utilizing appropriate data structures (Heaps, Queues, Hash Maps) for specific performance requirements (price priority, time priority, lookups).
*   Building RESTful APIs with modern frameworks like FastAPI.
*   Basic asynchronous programming (`asyncio`, `async/await`).
*   Connecting a frontend (React) to a backend API.
*   Deployment processes for web services and static sites using PaaS providers (Render, Vercel).
*   Using Git and GitHub for version control and deployment integration.
*   Skills directly applicable to **Application Analyst / Trading Systems Support** roles in the financial technology sector.

## License

*(Optional: Choose a license, e.g., MIT)*
[MIT License](LICENSE.txt) or similar.