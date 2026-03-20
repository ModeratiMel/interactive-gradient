import { useEffect, useState, useRef } from "react";
import PhysicsExp from "../components/threejs/PhysicsExp";
import Portal from "../components/threejs/Portal";
import { Canvas } from '@react-three/fiber'
import GalaxyExp from "../components/threejs/GalaxyExp";
import Waves from "../components/threejs/Waves";
import Grain from "../components/threejs/Grain";
import MovingGradient from "../components/threejs/MovingGradient";

export default function Home()
{

    // //mouse position
    // const [mousePosition,setMousePosition] = useState({ x: 1, y: 1 });
    // const updateMousePosition = ev => {
    //     let fromCenterX = ev.clientX/window.innerWidth
    //     let fromCenterY = ev.clientY/window.innerHeight
    //     setMousePosition({ x: fromCenterX, y: fromCenterY });
    // };
    // useEffect(()=> {
    //     window.addEventListener('mousemove', updateMousePosition);
    // })

    // //window size
    // const [windowSize, setWindowSize] = useState({x:window.innerWidth, y:window.innerHeight})
    // const updateSize = () => {
    //     setWindowSize({x:window.innerWidth, y:window.innerHeight})
    // }
    // window.addEventListener('resize', updateSize)

    return <>
        {/* <div className="absolute top-0 left-0 w-screen h-screen z-10">
            <Page>
                <Section className="flex-col mb-5 mt-20 md:mt-10 ">
                    <h1 className="text-6xl sm:text-8xl">Hello World</h1>
                    <h2 className="text-3xl max-w-md m-2">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</h2>
                </Section>
            </Page>
        </div> */}
        <div className="absolute top-0 left-0 w-screen h-screen z-0">
            <Canvas frameloop="always">
                {/* <Portal 
                    mousePosition={mousePosition}
                    windowSize={windowSize}
                />  */}
                <MovingGradient/>
            </Canvas>
        </div>
        <div className="w-full h-full bg-black"></div>
    </>
}