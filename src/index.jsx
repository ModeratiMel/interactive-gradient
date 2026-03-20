import ReactDOM from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';

const root = ReactDOM.createRoot(document.querySelector('#root'));

root.render(
  <Router>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
  </Router>
);