import { useEffect, useState } from "react";
import { Canvas } from '@react-three/fiber'
import MovingGradient from "../components/threejs/MovingGradient";
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
      {/* <div className="absolute top-0 left-0 w-screen h-screen z-10">
            <Page>
                <Section className="flex-col mb-5 mt-20 md:mt-10 ">
                    <h1 className="text-6xl sm:text-8xl">Hello World</h1>
                    <h2 className="text-3xl max-w-md m-2">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</h2>
                </Section>
            </Page>
        </div> */}
    <div className="absolute top-0 left-0 w-screen h-screen z-0">
            <Leva />
            <Canvas frameloop="always">
                <Perf position="top-left"/>
        <MovingGradient
          mousePosition={mousePosition}
          windowSize={windowSize}
        />
      </Canvas>
    </div>
  </>)
}