// import { useState } from 'react'
// import heroImg from './assets/hero.png'
// import reactLogo from './assets/react.svg'
// import viteLogo from './assets/vite.svg'
import CsvUpload from "./components/csvUpload.tsx";

import './App.css'

function App() {
  // const [count, setCount] = useState(0)

  return (
    <>
      <h1></h1>
      <p>Enjoy your dashboard.</p>

      <h1>Upload CSV</h1>
      <CsvUpload />

    </>
  )
}

export default App
