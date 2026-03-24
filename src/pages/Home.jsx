import { useEffect, useState } from "react";
import { Canvas } from '@react-three/fiber'
import Terrain from "../components/threejs/Terrain";
import { Leva } from "leva";
import { Perf } from "r3f-perf";

export default function Home()
{

  // Mouse position in [0,1] — (0,0) = top-left
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 })

  // Window size in CSS pixels
  const [windowSize, setWindowSize] = useState({
  x: typeof window !== 'undefined' ? window.innerWidth : 1,
  y: typeof window !== 'undefined' ? window.innerHeight : 1,
})

  useEffect(() => {
    const onMouseMove = (e) => {
      setMousePosition({
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      })
    }
    const onResize = () => {
      setWindowSize({ x: window.innerWidth, y: window.innerHeight })
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', onResize)
    }
  }, [])

    return (<>

    <div className="absolute top-0 left-0 w-screen h-screen z-0 opacity-70">
            <Leva />
            <Canvas frameloop="always">
                <Perf position="top-left"/>

          <Terrain
          mousePosition={mousePosition}
          />
      </Canvas>
    </div>
  </>)
}