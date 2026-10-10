import { lazy, Suspense, useCallback, useState } from 'react'
import Hero from './components/Hero'
import LoadingScreen from './components/LoadingScreen'

const InteractiveGame = lazy(() => import('./components/InteractiveGame'))

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const finishLoading = useCallback(() => setIsLoading(false), [])

  return (
    <>
      {/* The site is mounted right away underneath, so the slide-up reveals it fully rendered. */}
      {isLoading && <LoadingScreen onFinish={finishLoading} />}
      <Hero />
      <Suspense fallback={<div className="game-fallback" aria-hidden="true" />}>
        <InteractiveGame />
      </Suspense>
    </>
  )
}

export default App
