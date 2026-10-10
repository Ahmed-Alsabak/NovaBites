import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import loader from '../data/loaderSprites.json'
import alienSprites from '../data/alienSprites.json'
import './LoadingScreen.css'

/**
 * Cinematic loading screen:
 *   1. the alien sprints in from the right, a cookie in hand
 *   2. it hops through the porthole of the cookie rocket
 *   3. engine shake -> pixel flame + smoke -> lift-off
 *   4. the whole screen slides up and reveals the site; `onFinish` unmounts it for good.
 *
 * Everything is driven by ONE gsap timeline (transform / opacity only, so it stays on the
 * compositor at 60fps). The percentage is real: it follows the preloading of the site's first
 * screens and the lift-off waits for it (with a safety timeout).
 */

/* -------------------------------------------------------------------------- */
/*  Data                                                                      */
/* -------------------------------------------------------------------------- */

const { running, rocket } = loader

/** Assets of the next screens, warmed up while the alien runs. */
const SITE_ASSETS = [
  '/images/pxsprite-space%201.webp',
  ...[
    'SimpleCookie',
    'KIKICookie',
    'SnickersCookie',
    'NewYorkcookie',
    'SunsetCookie',
    'CoalCookie',
    'WhiteCookie',
    'DollarCookie',
  ].map((name) => `/images/${name}.webp`),
  ...Object.values(alienSprites).map((s) => s.src),
]
const OWN_ASSETS = [running.src, rocket.src]

const RUNNER_SCALE = 1.3 // alien size relative to its sprite strip
const BODY_MID = 44 * RUNNER_SCALE // height of the alien's body centre above its feet (px)
const ASSET_TIMEOUT = 9000 // never keep the visitor waiting longer than this (ms)
const RUN_TIME = 2.7 // alien sprint (s)
const HOP_TIME = 0.55 // jump into the porthole (s)
const SHAKE_TIME = 1.05 // engine shake before lift-off (s)
const LIFTOFF_TIME = 1.05 // rocket leaves the screen (s)
const SLIDE_TIME = 1.1 // loader slide-up (s)

/** Tiny seeded PRNG so the star field / smoke are identical on every render. */
const rng = (seed) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

function makeStars(seed, count, colors) {
  const rand = rng(seed)
  return Array.from({ length: count }, () => {
    const x = (rand() * 100).toFixed(2)
    const y = (rand() * 100).toFixed(2)
    return `${x}vw ${y}vh 0 0 ${colors[Math.floor(rand() * colors.length)]}`
  }).join(',')
}

const STAR_LAYERS = [
  { cls: 'a', shadow: makeStars(7, 46, ['#ffffff', '#9fd8ff']) },
  { cls: 'b', shadow: makeStars(23, 34, ['#ffffff', '#ffe600', '#ff9bf2']) },
  { cls: 'c', shadow: makeStars(51, 22, ['#7ff6ff', '#ffffff']) },
]

const SMOKE = (() => {
  const rand = rng(99)
  return Array.from({ length: 16 }, (_, i) => {
    const side = i % 2 ? 1 : -1
    return {
      dx: side * (30 + rand() * 210), // spread along the ground (px)
      rise: 14 + rand() * 46,
      size: 14 + Math.round(rand() * 4) * 4,
      grow: 1.6 + rand() * 1.8,
    }
  })
})()

/** Pixel flame: [row, firstColumn, lastColumn] for each colour layer (12 x 18 grid). */
const FLAME = [
  { fill: '#ff6a1a', rows: [[0, 3, 8], [1, 2, 9], [2, 1, 10], [3, 1, 10], [4, 1, 10], [5, 1, 10], [6, 2, 9], [7, 2, 9], [8, 2, 9], [9, 3, 8], [10, 3, 8], [11, 3, 8], [12, 4, 7], [13, 4, 7], [14, 5, 6], [15, 5, 6], [16, 5, 6], [17, 5, 6]] },
  { fill: '#ffc21f', rows: [[0, 4, 7], [1, 3, 8], [2, 3, 8], [3, 3, 8], [4, 3, 8], [5, 3, 8], [6, 4, 7], [7, 4, 7], [8, 4, 7], [9, 5, 6], [10, 5, 6], [11, 5, 6], [12, 5, 6]] },
  { fill: '#fff6c2', rows: [[0, 5, 6], [1, 5, 6], [2, 5, 6], [3, 5, 6], [4, 5, 6], [5, 5, 6], [6, 5, 6]] },
]

const SHAKE = {
  x: [0, -3, 3, -4, 4, -5, 5, -6, 6, -7, 7, -6, 6, -4, 0],
  y: [0, -1, 1, -1, 1, -2, 1, -2, 2, -2, 1, -2, 1, -1, 0],
}

const loadImage = (src) =>
  new Promise((resolve) => {
    const img = new Image()
    img.onload = resolve
    img.onerror = resolve // a missing file must never block the intro
    img.src = src
  })

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

function LoadingScreen({ onFinish }) {
  const rootRef = useRef(null)
  const groundRef = useRef(null)
  const anchorRef = useRef(null)
  const rocketRef = useRef(null)
  const bodyRef = useRef(null)
  const flameRef = useRef(null)
  const portRef = useRef(null)
  const glowRef = useRef(null)
  const runnerRef = useRef(null)
  const stripRef = useRef(null)
  const hudRef = useRef(null)
  const barRef = useRef(null)
  const fillRef = useRef(null)
  const percentRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    const html = document.documentElement
    html.classList.add('is-loading') // locks page scroll while the intro plays
    let cancelled = false

    /* ------------------------------------------------------- real progress */
    const total = OWN_ASSETS.length + SITE_ASSETS.length + 1 // +1: the pixel font
    let loaded = 0
    let assetsDone = false
    const prog = { run: 0 } // timeline-driven part (0..100)
    let shown = -1

    const render = () => {
      if (cancelled) return // ctx.revert() re-renders the tweens after the DOM is gone
      const ratio = assetsDone ? 1 : loaded / total
      const pct = Math.round(Math.min(prog.run, ratio * 100))
      if (pct === shown) return
      shown = pct
      percentRef.current.textContent = `${pct}%`
      fillRef.current.style.transform = `scaleX(${pct / 100})`
      barRef.current.setAttribute('aria-valuenow', String(pct))
    }
    const track = (promise) =>
      promise.then(() => {
        loaded++
        render()
      })

    const fontReady = track(document.fonts.load('20px CustomPixelFont').catch(() => {}))
    const ownReady = Promise.all([fontReady, ...OWN_ASSETS.map((src) => track(loadImage(src)))])
    const siteReady = Promise.all(SITE_ASSETS.map((src) => track(loadImage(src))))
    let timer = 0
    const allReady = Promise.race([
      Promise.all([ownReady, siteReady]),
      new Promise((resolve) => {
        timer = setTimeout(resolve, ASSET_TIMEOUT)
      }),
    ]).then(() => {
      assetsDone = true
      render()
    })

    /* ------------------------------------------------------------- geometry */
    // Read lazily (gsap evaluates function values when each tween starts), so a resize that
    // happens mid-intro is still honoured.
    const geo = () => {
      const a = anchorRef.current.getBoundingClientRect()
      const groundY = groundRef.current.getBoundingClientRect().top
      // nose + held cookie stay clear of the fin tips, but the whole alien must stay on screen
      const stopX = Math.min(a.right + 66 * RUNNER_SCALE, window.innerWidth - 70 * RUNNER_SCALE)
      return {
        startX: window.innerWidth + 90,
        stopX,
        portX: a.left + a.width * rocket.portX,
        // the alien's body centre lands on the porthole
        hopY: a.top + a.height * rocket.portY + BODY_MID - groundY,
      }
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ paused: true })

      // Hold the lift-off until the next screens are really loaded.
      const gate = () => {
        if (assetsDone) return
        tl.pause()
        allReady.then(() => {
          if (!cancelled) tl.resume()
        })
      }

      if (reduceMotion) {
        tl.to(prog, { run: 100, duration: 0.6, ease: 'none', onUpdate: render })
          .call(gate)
          .to(root, { autoAlpha: 0, duration: 0.4, onComplete: onFinish })
        ownReady.then(() => !cancelled && tl.play())
        return
      }

      const strip = stripRef.current
      const runCycle = strip.getAnimations()[0] // CSS steps() animation of the sprite strip

      gsap.set(runnerRef.current, { x: () => geo().startX, transformOrigin: `0px ${-BODY_MID}px` })
      gsap.set(flameRef.current, { scaleY: 0, transformOrigin: '50% 0' })
      gsap.set([portRef.current, glowRef.current], { opacity: 0 })

      /* 0 - progress bar (real loading caps it) */
      tl.to(prog, { run: 100, duration: RUN_TIME + HOP_TIME, ease: 'power1.inOut', onUpdate: render }, 0)

      /* 1 - the sprint: constant speed, stride stays at full rate */
      if (runCycle) runCycle.playbackRate = 1
      tl.to(
        runnerRef.current,
        { x: () => geo().stopX, duration: RUN_TIME, ease: 'none' },
        0,
      )

      /* 2 - hop into the porthole the instant the feet reach the rocket (no brake) */
      tl.addLabel('hop')
        .call(() => strip.classList.add('is-still'), null, 'hop')
        .to(runnerRef.current, { y: () => geo().hopY, duration: HOP_TIME, ease: 'power2.out' }, 'hop')
        .to(runnerRef.current, { x: () => geo().portX, duration: HOP_TIME, ease: 'power1.in' }, 'hop')
        .to(
          runnerRef.current,
          { scale: 0.3, autoAlpha: 0, duration: 0.28, ease: 'power2.in' },
          `hop+=${HOP_TIME - 0.28}`,
        )
        // the porthole flashes and the rocket squashes as the pilot lands inside
        .addLabel('inside', `hop+=${HOP_TIME - 0.08}`)
        .to(portRef.current, { opacity: 1, duration: 0.1, ease: 'none' }, 'inside')
        .to(portRef.current, { opacity: 0, duration: 0.45, ease: 'power2.out' }, 'inside+=0.1')
        .to(bodyRef.current, { scaleY: 0.955, transformOrigin: '50% 100%', duration: 0.1, ease: 'power2.out' }, 'inside')
        .to(bodyRef.current, { scaleY: 1, duration: 0.45, ease: 'elastic.out(1, 0.35)' }, 'inside+=0.1')

      /* 3 - ignition: wait for the page, then shake, burn, smoke, lift off */
      tl.addLabel('launch', '>+0.15')
        .call(gate, null, 'launch')
        .to(hudRef.current, { autoAlpha: 0, duration: 0.3, ease: 'power1.out' }, 'launch')
        .to(glowRef.current, { opacity: 1, duration: SHAKE_TIME, ease: 'power1.in' }, 'launch')
        .to(
          bodyRef.current,
          { keyframes: { x: SHAKE.x, y: SHAKE.y, easeEach: 'none' }, duration: SHAKE_TIME, ease: 'none' },
          'launch',
        )
        .to(flameRef.current, { scaleY: 1, duration: 0.55, ease: 'power2.out' }, 'launch+=0.2')
        .fromTo(
          '.smoke',
          { x: (i) => SMOKE[i].dx * 0.15, y: 0, scale: 0.4, opacity: 0.95 },
          {
            x: (i) => SMOKE[i].dx,
            y: (i) => -SMOKE[i].rise,
            scale: (i) => SMOKE[i].grow,
            opacity: 0,
            duration: 1.25,
            ease: 'power2.out',
            stagger: 0.05,
            immediateRender: false, // stay invisible (CSS opacity 0) until the launch
          },
          'launch+=0.35',
        )

      /* lift-off: flame stretches, rocket accelerates out of the screen, stars streak past */
      tl.addLabel('liftoff', `launch+=${SHAKE_TIME}`)
        .to(flameRef.current, { scaleY: 1.8, scaleX: 1.15, duration: 0.4, ease: 'power2.out' }, 'liftoff')
        .to(rocketRef.current, { y: '-150vh', duration: LIFTOFF_TIME, ease: 'power3.in' }, 'liftoff')
        .to('.stars', { y: (i) => 60 + i * 70, duration: LIFTOFF_TIME, ease: 'power2.in' }, 'liftoff')
        .to(glowRef.current, { opacity: 0, duration: 0.6, ease: 'power1.out' }, 'liftoff+=0.3')

      /* 4 - slide the whole loader up and hand over to the site */
      tl.to(
        root,
        { yPercent: -100, duration: SLIDE_TIME, ease: 'power4.inOut', onComplete: onFinish },
        `liftoff+=${LIFTOFF_TIME * 0.7}`, // the rocket is out of sight by then
      )

      ownReady.then(() => !cancelled && tl.play())
    }, root)

    return () => {
      cancelled = true
      clearTimeout(timer)
      ctx.revert()
      html.classList.remove('is-loading')
    }
  }, [onFinish])

  const strip = { w: running.cellW * running.frames, h: running.cellH }

  return (
    <div className="loader" ref={rootRef} role="status" aria-label="جاري التحميل">
      {STAR_LAYERS.map(({ cls, shadow }) => (
        <i key={cls} className={`stars stars--${cls}`} style={{ boxShadow: shadow }} />
      ))}

      <div className="loader__stage">
        <div className="loader__glow" ref={glowRef} />

        {/* rocket + launch pad */}
        <div className="rocket-anchor" ref={anchorRef}>
          <div className="pad" />
          {SMOKE.map((puff, i) => (
            <i key={i} className="smoke" style={{ width: puff.size, height: puff.size }} />
          ))}
          <div className="rocket" ref={rocketRef}>
            <div className="rocket__body" ref={bodyRef}>
              <div className="rocket__flame" ref={flameRef}>
                <svg viewBox="0 0 12 18" shapeRendering="crispEdges" aria-hidden="true">
                  {FLAME.map(({ fill, rows }) => (
                    <g key={fill} fill={fill}>
                      {rows.map(([y, x0, x1]) => (
                        <rect key={y} x={x0} y={y} width={x1 - x0 + 1} height="1" />
                      ))}
                    </g>
                  ))}
                </svg>
              </div>
              <img
                src={rocket.src}
                alt=""
                width={rocket.w}
                height={rocket.h}
                fetchPriority="high"
                loading="eager"
                decoding="async"
                draggable="false"
              />
              <i
                className="rocket__port"
                ref={portRef}
                style={{ left: `${rocket.portX * 100}%`, top: `${rocket.portY * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* the sprinter */}
        <div className="runner" ref={runnerRef} style={{ '--k': RUNNER_SCALE }}>
          <div className="runner__flip">
            <div
              className="runner__sprite"
              style={{
                width: running.cellW,
                height: running.cellH,
                left: -running.anchorX,
              }}
            >
              <img
                ref={stripRef}
                className="runner__strip"
                src={running.src}
                alt=""
                width={strip.w}
                height={strip.h}
                fetchPriority="high"
                loading="eager"
                decoding="async"
                draggable="false"
                style={{
                  width: strip.w,
                  height: strip.h,
                  '--frames': running.frames,
                  '--fps': running.fps,
                  '--strip-w': `${strip.w}px`,
                }}
              />
            </div>
            <img
              className="runner__cookie"
              src="/images/SimpleCookie.webp"
              alt=""
              width={409}
              height={610}
              loading="eager"
              decoding="async"
              draggable="false"
              style={{ left: running.cellW - running.anchorX - 26 }} // held out in front of the nose
            />
          </div>
        </div>

        {/* ground slab with the progress read-out */}
        <div className="ground" ref={groundRef}>
          <div className="hud" ref={hudRef}>
            <span className="hud__percent" ref={percentRef} dir="ltr">
              0%
            </span>
            <div className="hud__bar" ref={barRef} dir="ltr" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
              <i className="hud__fill" ref={fillRef} />
            </div>
            <span className="hud__label">جاري التحضير للإقلاع</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoadingScreen
