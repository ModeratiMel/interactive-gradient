import { useGLTF, OrbitControls } from '@react-three/drei'
import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

const Mars = () => {
    const mars = useGLTF('./Mars/scene.gltf')
    
    return <primitive
        object={ mars.scene }
        scale={ 3 }
        position={[0, 0, 0]}
        rotation-x={-0.5}
        rotation-y={-0.6}
        rotation-z={0}
    />
}

export default function Terrain({ mousePosition }) {
    
  const controlsRef = useRef()
    const { camera, gl } = useThree()

  useFrame(() => {
    if (!controlsRef.current) return

    const { x, y } = mousePosition // x and y in [0,1]

    // Map mouse to angles
    const minTheta = -Math.PI / 4
    const maxTheta = Math.PI / 4
    const minPhi = Math.PI / 4
    const maxPhi = Math.PI / 2

    const theta = minTheta + (maxTheta - minTheta) * x
    const phi = minPhi + (maxPhi - minPhi) * y
    
      console.log(
    controlsRef.current
      )
    controlsRef.current.update()
  })

  return (
    <>
      <OrbitControls ref={controlsRef} args={[camera, gl.domElement]}  />
      <Mars />
    </>
  )
}