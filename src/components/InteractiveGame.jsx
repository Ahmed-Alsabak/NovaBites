import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import sprites from '../data/alienSprites.json'
import './InteractiveGame.css'

/* -------------------------------------------------------------------------- */
/*  Data                                                                      */
/* -------------------------------------------------------------------------- */

const CURRENCY = 'د.ع'

// NOTE: prices are placeholders - edit them here.
const COOKIE_PX = { w: 409, h: 610 }

const COOKIES = [
  {
    id: 'simple',
    file: 'SimpleCookie.webp',
    name: 'SIMPLE COOKIE',
    price: 3000,
    blurb: 'هي نفسها الكلاسيك كوكي، والرب يبارك الجميع',
  },
  {
    id: 'kiki',
    file: 'KIKICookie.webp',
    name: 'KIKI COOKIE',
    price: 3000,
    blurb: 'كيكي دو يو لوف ميي .... لالا دنتشاقه، هي كندر كوكي، سميناها كيكي على أغنية "دريك"',
  },
  {
    id: 'sneaky',
    file: 'SnickersCookie.webp',
    name: 'SNEAKY COOKIE',
    price: 3000,
    blurb: 'سنكرز كوكي،،، مانعرف ليش سميناها هيج -_- بس أهمشي هي قريبة عالاسم 3>',
  },
  {
    id: 'newyork',
    file: 'NewYorkcookie.webp',
    name: 'NEW YORK COOKIE',
    price: 3000,
    blurb: 'كلاسيك كوكي، بس الككو محشي بنصها وليس خارجي',
  },
  {
    id: 'sunset',
    file: 'SunsetCookie.webp',
    name: 'SUNSET COOKIE',
    price: 3000,
    blurb: 'كوكي الغروب، هي نفسها الـ Red Velvet، سميناها هيج لأن لونها يميل للغروب',
  },
  {
    id: 'coal',
    file: 'CoalCookie.webp',
    name: 'COAL COOKIE',
    price: 3000,
    blurb: 'كوكي الفحم، اللي هي دارك تشوكليت كوكيز.',
  },
  {
    id: 'white',
    file: 'WhiteCookie.webp',
    name: 'WHITE COOKIE',
    price: 3000,
    blurb: 'وايت تشوكليت كوكي، وكلو نايس على نايس وكلو كوكي بككو أبيض.',
  },
  {
    id: 'dollar',
    file: 'DollarCookie.webp',
    name: 'DOLLAR COOKIE',
    price: 3000,
    blurb: 'هي بيستاشيو كوكي، سميناها هيج لأن لونها قريب على الـ 100$.',
  },
]

const PALETTE = ['#00f0ff', '#ff3df2', '#ffe600', '#a35bff']

/* -------------------------------------------------------------------------- */
/*  Level geometry (world pixels, y grows downwards)                          */
/* -------------------------------------------------------------------------- */

const LV = {
  platformW: 540,
  stairW: 392,
  steps: 7,
  drop: 154,
  treadH: 30,
  platformH: 56,
  startPad: 300,
  endPad: 340,
  top: 440,
  cookieW: 150,
  cookieH: 224,
}

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const mixHex = (a, b, t) => {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`
}

function buildLevel() {
  const platforms = []
  const stairs = []
  const segments = []
  let x = LV.startPad
  COOKIES.forEach((_, i) => {
    const y = LV.top + i * LV.drop
    const color = PALETTE[i % PALETTE.length]
    platforms.push({ x, y, w: LV.platformW, cx: x + LV.platformW / 2, color })
    segments.push({ x0: x, x1: x + LV.platformW, y0: y, y1: y, stairs: false })
    x += LV.platformW
    if (i < COOKIES.length - 1) {
      const y1 = LV.top + (i + 1) * LV.drop
      const seg = {
        x0: x,
        x1: x + LV.stairW,
        y0: y,
        y1,
        stairs: true,
        index: i,
        from: color,
        to: PALETTE[(i + 1) % PALETTE.length],
      }
      stairs.push(seg)
      segments.push(seg)
      x += LV.stairW
    }
  })
  return {
    platforms,
    stairs,
    segments,
    width: x + LV.endPad,
    height: LV.top + (COOKIES.length - 1) * LV.drop + 720,
    minX: LV.startPad + 36,
    maxX: x - 40,
    startX: LV.startPad + 70,
  }
}

const LEVEL = buildLevel()

function segmentAt(x) {
  const segs = LEVEL.segments
  for (let i = 0; i < segs.length; i++) {
    if (x < segs[i].x1) return segs[i]
  }
  return segs[segs.length - 1]
}

/** Surface height under x. Stairs are quantised so the alien really steps down them. */
function surfaceY(seg, x) {
  if (!seg.stairs) return seg.y0
  const t = Math.min(0.9999, Math.max(0, (x - seg.x0) / (seg.x1 - seg.x0)))
  const k = Math.floor(t * LV.steps)
  return seg.y0 + ((k + 1) * (seg.y1 - seg.y0)) / LV.steps
}

/* -------------------------------------------------------------------------- */
/*  Tuning                                                                    */
/* -------------------------------------------------------------------------- */

const WALK_SPEED = 270
const STAIR_SPEED = 205
const ACCEL = 2600
const DECEL = 3600
const PROXIMITY_ENTER = 150
const PROXIMITY_LEAVE = 200
const CAM_FOCUS_Y = 0.56
const CAM_LIFT = 70
const STAR_TILE = 512

// intro: the alien waves from under the hero, then drops onto the first platform
const PEEK_X = 0.82 // horizontal position (share of the width) where it peeks / lands
const PEEK_SHOW = 108 // px of the alien that stick out above the hero's bottom edge
const FALL_GRAVITY = 3000
const FALL_HOP = 420

// character states (also written to `data-state` on the alien, styled in the CSS)
const ALIEN_STATE = {
  IDLE: 'idle',
  STAIRS: 'stairs',
  WALK: 'walking',
  JETPACK_FLYING: 'jetpack',
}

// jetpack fast travel
const LAND_GAP = 96 // how far in front of the cookie the alien touches down
const SPARK_COUNT = 18
const SPARK_COLORS = ['#fff6a8', '#ffe600', '#ff9a1f', '#ff3df2']
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const mod = (v, m) => ((v % m) + m) % m
const approach = (v, target, step) =>
  v < target ? Math.min(target, v + step) : Math.max(target, v - step)

/* -------------------------------------------------------------------------- */
/*  Small pieces                                                              */
/* -------------------------------------------------------------------------- */

function ArrowIcon({ flip = false }) {
  return (
    <svg
      className="arrow-icon"
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      aria-hidden="true"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M3 0h1v1H3zM2 1h2v1H2zM1 2h3v1H1zM0 3h4v2H0zM1 5h3v1H1zM2 6h2v1H2zM3 7h1v1H3z" />
    </svg>
  )
}

/** Animated sprite strip. Pass `frame` to freeze it on a single frame instead. */
function Sprite({ name, data, frame }) {
  const still = frame !== undefined
  return (
    <div
      className={`sprite sprite--${name}`}
      style={{
        width: data.cellW,
        height: data.cellH,
        left: -data.anchorX,
        top: -data.cellH,
        '--frames': data.frames,
        '--fps': data.fps,
      }}
    >
      <img
        className={`sprite__strip${still ? ' sprite__strip--still' : ''}`}
        src={data.src}
        alt=""
        width={data.cellW * data.frames}
        height={data.cellH}
        draggable="false"
        decoding="async"
        style={{
          width: data.cellW * data.frames,
          height: data.cellH,
          transform: still ? `translate3d(${-frame * data.cellW}px, 0, 0)` : undefined,
        }}
      />
    </div>
  )
}

function makeStarTile(seed, count, colors, maxSize) {
  const canvas = document.createElement('canvas')
  canvas.width = STAR_TILE
  canvas.height = STAR_TILE
  const ctx = canvas.getContext('2d')
  let s = seed
  const rnd = () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = 0; i < count; i++) {
    const size = rnd() > 0.82 ? maxSize : Math.max(1, maxSize - 1)
    ctx.globalAlpha = 0.45 + rnd() * 0.55
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)]
    ctx.fillRect(Math.floor(rnd() * STAR_TILE), Math.floor(rnd() * STAR_TILE), size, size)
  }
  return canvas.toDataURL('image/png')
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

function InteractiveGame({ onOrder }) {
  const sectionRef = useRef(null)
  const viewportRef = useRef(null)
  const worldRef = useRef(null)
  const alienRef = useRef(null)
  const flipRef = useRef(null)
  const landRef = useRef(null)
  const peekRef = useRef(null)
  const peekBodyRef = useRef(null)
  const planetsRef = useRef(null)
  const starsFarRef = useRef(null)
  const starsNearRef = useRef(null)
  const leftBtnRef = useRef(null)
  const rightBtnRef = useRef(null)
  const stripWalkRef = useRef(null)
  const stripStairsRef = useRef(null)
  const jetRef = useRef(null)
  const sparkRefs = useRef([])
  const travelRef = useRef(null)

  // Mutable game state lives in a ref: the 60fps loop never touches React state.
  const game = useRef({
    x: LEVEL.startX,
    vx: 0,
    feetY: surfaceY(segmentAt(LEVEL.startX), LEVEL.startX) + 2,
    dir: 1,
    state: 'idle',
    camX: LEVEL.startX,
    camY: 0,
    input: { left: false, right: false },
    active: -1,
    capture: false,
    started: false,
    // intro: 'peek' (waving from under the hero) -> 'fall' -> 'done' (playable)
    phase: 'peek',
    fall: null,
    // jetpack fast travel
    flying: false,
    zoomFx: 1, // temporary camera zoom multiplier (pulled back while flying)
    // tutorial popup
    wasOnStairs: false,
    tutorialSeen: false,
  })

  // If the page is restored mid-scroll there is nothing to peek from: start playable.
  const [introInit] = useState(() =>
    typeof window !== 'undefined' && window.scrollY > window.innerHeight * 0.5 ? 'done' : 'peek',
  )
  const [dust, setDust] = useState(null) // { n, x, y } -> landing puff
  const [flyTarget, setFlyTarget] = useState(-1)
  const [showTutorial, setShowTutorial] = useState(false)
  const [ui, setUi] = useState({ active: -1, shown: 0 })
  const [visited, setVisited] = useState(() => COOKIES.map(() => false))
  const [started, setStarted] = useState(false)
  const [ordered, setOrdered] = useState(null)

  /* ------------------------------------------------------------- input API */

  const setInput = useCallback((side, pressed) => {
    const g = game.current
    if (pressed && g.phase !== 'done') return
    if (g.input[side] === pressed) return
    g.input[side] = pressed
    const btn = side === 'left' ? leftBtnRef.current : rightBtnRef.current
    if (btn) btn.dataset.pressed = pressed ? 'true' : 'false'
    if (pressed && !g.started) {
      g.started = true
      setStarted(true)
    }
  }, [])

  /** Closes the tutorial popup for this visit (it returns after a page refresh). */
  const dismissTutorial = useCallback(() => {
    game.current.tutorialSeen = true
    setShowTutorial(false)
  }, [])

  const holdProps = (side) => ({
    onPointerDown: (e) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture?.(e.pointerId)
      setInput(side, true)
    },
    onPointerUp: () => setInput(side, false),
    onPointerCancel: () => setInput(side, false),
    onLostPointerCapture: () => setInput(side, false),
    onContextMenu: (e) => e.preventDefault(),
  })

  /* ------------------------------------------------------------ game loop */

  useEffect(() => {
    const g = game.current
    const viewport = viewportRef.current
    const section = sectionRef.current
    const world = worldRef.current
    const alien = alienRef.current
    const flip = flipRef.current
    const planets = planetsRef.current
    const starsFar = starsFarRef.current
    const starsNear = starsNearRef.current

    // Procedural star tiles (cheap, seamless, no extra network request).
    starsFar.style.backgroundImage = `url(${makeStarTile(7, 70, ['#ffffff', '#9fd8ff', '#ffd9a8'], 2)})`
    starsNear.style.backgroundImage = `url(${makeStarTile(23, 26, ['#ffffff', '#ffe600', '#ff9bf2', '#7ff6ff'], 3)})`

    let vw = 0
    let vh = 0
    let zoom = 1
    let dpr = window.devicePixelRatio || 1
    let last = { tx: NaN, ty: NaN, ax: NaN, ay: NaN, px: NaN }
    let raf = 0
    let prev = 0
    let visible = false
    let animWalk = null
    let animStairs = null
    let walkRate = 1
    let stairsRate = 1

    const peek = peekRef.current
    const peekBody = peekBodyRef.current
    const landEl = landRef.current
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    g.phase = section.dataset.intro
    g.tutorialSeen = false // shown again after every page refresh

    /** Camera centred on the alien (playable). */
    const snapCamera = () => {
      g.camX = g.x
      g.camY = g.feetY - CAM_LIFT
    }

    /** During the intro the camera is parked so the alien lands where it was peeking from. */
    const lockCamera = () => {
      g.camX = g.x - (vw * (PEEK_X - 0.5)) / zoom
      g.camY = g.feetY - CAM_LIFT
    }

    const peekFeetY = () => -PEEK_SHOW + sprites.wave.cellH * zoom

    const placePeek = () => {
      peek.style.transform = `translate3d(${vw * PEEK_X}px, ${peekFeetY()}px, 0) scale(${zoom})`
      peekBody.style.transform = ''
    }

    const measure = () => {
      const r = viewport.getBoundingClientRect()
      vw = r.width
      vh = r.height
      dpr = window.devicePixelRatio || 1
      zoom = clamp(Math.min(vh / 760, Math.max(vw / 820, 0.62)), 0.6, 1.3)
      last = { tx: NaN, ty: NaN, ax: NaN, ay: NaN, px: NaN }
      if (g.phase !== 'done') {
        lockCamera()
        if (g.phase === 'peek') placePeek()
      }
      paint()
    }

    const paint = () => {
      const snap = (v) => Math.round(v * dpr) / dpr

      // camera -> world transform (zoomFx pulls the camera back during jetpack flights)
      const z = zoom * g.zoomFx
      const tx = snap(vw * 0.5 - g.camX * z)
      const ty = snap(vh * CAM_FOCUS_Y - g.camY * z)
      if (tx !== last.tx || ty !== last.ty || z !== last.z) {
        world.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${z})`
        last.tx = tx
        last.ty = ty
        last.z = z

        // parallax: the further the layer, the slower it moves
        const px = g.camX / LEVEL.width
        const py = (g.camY - LV.top) / (LEVEL.height - LV.top)
        planets.style.transform = `translate3d(${(0.5 - px) * vw * 0.1}px, ${(0.5 - py) * vh * 0.06}px, 0)`
        starsFar.style.transform = `translate3d(${-mod(g.camX * 0.04, STAR_TILE)}px, ${-mod(g.camY * 0.04, STAR_TILE)}px, 0)`
        starsNear.style.transform = `translate3d(${-mod(g.camX * 0.11, STAR_TILE)}px, ${-mod(g.camY * 0.11, STAR_TILE)}px, 0)`
      }

      // alien
      const ax = Math.round(g.x * 10) / 10
      const ay = Math.round(g.feetY * 10) / 10
      if (ax !== last.ax || ay !== last.ay) {
        alien.style.transform = `translate3d(${ax}px, ${ay}px, 0)`
        last.ax = ax
        last.ay = ay
      }
    }

    const setState = (next) => {
      if (g.state === next) return
      g.state = next
      alien.dataset.state = next
    }

    /** Squash the alien and drop a dust puff where its feet are. */
    const puff = () => {
      landEl.classList.remove('is-landing')
      void landEl.offsetWidth // restart the squash animation
      landEl.classList.add('is-landing')
      setDust((d) => ({ n: (d?.n ?? 0) + 1, x: g.x, y: g.feetY }))
    }

    /* ---------------------------------------------------------- intro ---- */

    let pageFollow = null
    let touchY = null

    const gameTopY = () => Math.max(0, Math.round(window.scrollY + section.getBoundingClientRect().top))

    const stopPageFollow = (snap) => {
      if (!pageFollow) return
      if (snap) window.scrollTo(0, pageFollow.dest)
      pageFollow = null
    }

    const land = () => {
      stopPageFollow(true)
      g.phase = 'done'
      g.fall = null
      section.dataset.intro = 'done'
      g.vx = 0
      setState(ALIEN_STATE.IDLE)
      g.camY -= 18 / zoom // little camera thump
      puff()
      paint()
    }

    const startFall = () => {
      if (g.phase !== 'peek') return
      const dest = gameTopY()
      if (reduceMotion) {
        window.scrollTo(0, dest)
        land()
        return
      }
      g.phase = 'fall'
      section.dataset.intro = 'fall'
      const y0 = peekFeetY()
      const ly = vh * CAM_FOCUS_Y + CAM_LIFT * zoom // where the feet will touch the platform
      const vy0 = -FALL_HOP
      const T = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * FALL_GRAVITY * Math.max(1, ly - y0))) / FALL_GRAVITY
      g.fall = { t: 0, y: y0, vy: vy0, ly, T }
      // camera = page: keep the falling alien on screen so the pads are visible on landing
      const sectionTop = section.getBoundingClientRect().top
      pageFollow = { dest, startScreen: sectionTop + y0, ly }
      visible = true
      start()
    }

    const stepFall = (dt) => {
      const f = g.fall
      if (!f) return
      f.t += dt
      f.vy += FALL_GRAVITY * dt
      f.y += f.vy * dt
      const u = clamp(f.t / f.T, 0, 1)
      const peekY = Math.min(f.y, f.ly)
      // stretch while falling, small tilt for personality
      const stretch = 1 + 0.1 * Math.sin(u * Math.PI)
      const tilt = -12 * Math.sin(u * Math.PI * 1.3)
      peek.style.transform = `translate3d(${vw * PEEK_X}px, ${peekY}px, 0) scale(${zoom})`
      peekBody.style.transform = `rotate(${tilt}deg) scale(${1 / stretch}, ${stretch})`
      if (pageFollow) {
        const e = 1 - (1 - u) ** 3
        const screenY = pageFollow.startScreen + (pageFollow.ly - pageFollow.startScreen) * e
        window.scrollTo(0, clamp(pageFollow.dest - (screenY - peekY), 0, pageFollow.dest))
      }
      if (f.y >= f.ly || f.t >= f.T) land()
    }

    /** Back at the top of the page: hide again and wait for the next scroll. */
    const resetIntro = () => {
      flight?.kill()
      flight = null
      zoomTween?.kill()
      g.zoomFx = 1
      g.flying = false
      jet.style.transform = ''
      setFlyTarget(-1)
      g.wasOnStairs = false
      g.phase = 'peek'
      g.fall = null
      section.dataset.intro = 'peek'
      g.x = LEVEL.startX
      g.vx = 0
      g.feetY = surfaceY(segmentAt(g.x), g.x) + 2
      g.dir = 1
      flip.dataset.dir = '1'
      g.input.left = false
      g.input.right = false
      setState('idle')
      if (g.active !== -1) {
        g.active = -1
        setUi((s) => ({ active: -1, shown: s.shown }))
      }
      last = { tx: NaN, ty: NaN, ax: NaN, ay: NaN, px: NaN }
      stopPageFollow(false)
      lockCamera()
      placePeek()
      paint()
    }

    const onScroll = () => {
      const top = section.getBoundingClientRect().top
      const wh = window.innerHeight
      if (g.phase === 'peek') {
        if (top < wh - Math.max(70, wh * 0.08)) startFall()
      } else if (g.phase === 'done' && top >= wh - 1) {
        resetIntro()
      }
    }

    const onWheel = (e) => {
      if (g.phase === 'peek' && e.deltaY > 0) {
        if (e.cancelable) e.preventDefault()
        startFall()
        return
      }
      if (g.phase === 'fall' && e.cancelable) e.preventDefault()
    }

    const onTouchStart = (e) => {
      touchY = e.touches[0]?.clientY ?? null
    }

    const onTouchMove = (e) => {
      if (g.phase === 'fall') {
        if (e.cancelable) e.preventDefault()
        return
      }
      if (g.phase !== 'peek' || touchY == null) return
      const dy = touchY - e.touches[0].clientY
      if (dy > 6) {
        if (e.cancelable) e.preventDefault()
        startFall()
      }
    }

    /* ---------------------------------------------- jetpack fast travel ---- */

    const jet = jetRef.current
    const sparks = sparkRefs.current
    let sparkIdx = 0
    let sparkClock = 0
    let flight = null
    let zoomTween = null

    /** One pixel ember, recycled from a fixed pool and animated with WAAPI (compositor only). */
    const emitSpark = (x, y, dir) => {
      const el = sparks[sparkIdx++ % SPARK_COUNT]
      if (!el || !el.animate) return
      const dx = -dir * (24 + Math.random() * 56)
      const dy = 6 + Math.random() * 48
      el.style.background = SPARK_COLORS[(Math.random() * SPARK_COLORS.length) | 0]
      el.animate(
        [
          { opacity: 1, transform: `translate3d(${x}px, ${y}px, 0) scale(1)` },
          { opacity: 0, transform: `translate3d(${x + dx}px, ${y + dy}px, 0) scale(0.3)` },
        ],
        { duration: 360 + Math.random() * 320, easing: 'steps(6)' },
      )
    }

    const zoomTo = (value, duration, ease) => {
      zoomTween?.kill()
      zoomTween = gsap.to(g, { zoomFx: value, duration, ease })
    }

    const travelTo = (index) => {
      if (g.phase !== 'done' || index < 0 || index >= LEVEL.platforms.length) return
      const target = LEVEL.platforms[index]
      const dir = Math.sign(target.cx - g.x) || 1
      const landX = clamp(target.cx - dir * LAND_GAP, LEVEL.minX, LEVEL.maxX)
      const landY = target.y + 2

      // already standing right there: the dialogue is (or will be) open, nothing to fly
      if (!g.flying && Math.abs(g.x - landX) < 24 && Math.abs(g.feetY - landY) < 8) return

      dismissTutorial() // they found the feature: the hint has done its job
      flight?.kill() // re-targeting mid-flight starts a new arc from where we are
      g.flying = true
      g.vx = 0
      setInput('left', false)
      setInput('right', false)
      g.dir = dir
      flip.dataset.dir = String(dir)
      setState(ALIEN_STATE.JETPACK_FLYING)
      setFlyTarget(index)
      // close whatever dialogue is open
      if (g.active !== -1) {
        g.active = -1
        setUi((s) => ({ active: -1, shown: s.shown }))
      }

      const from = { x: g.x, y: g.feetY }
      const dist = Math.abs(landX - from.x)
      const lift = 120 + Math.min(dist * 0.045, 190)
      const duration = clamp(0.75 + dist / 2800, 0.9, 2.6)
      let lastX = from.x
      let lastMs = performance.now()

      const finish = () => {
        flight = null
        g.flying = false
        g.vx = 0
        g.x = landX
        g.feetY = landY
        jet.style.transform = ''
        setFlyTarget(-1)
        setState(ALIEN_STATE.IDLE)
        zoomTo(1, 0.7, 'power2.inOut')
        g.camY -= 10 / zoom // soft landing thump
        puff()
        paint()
      }

      if (reduceMotion) {
        g.x = landX
        g.feetY = landY
        finish()
        return
      }

      const p = { t: 0 }
      zoomTo(0.88, 0.45, 'power2.out')
      flight = gsap.timeline({ onComplete: finish })
      flight.to(
        p,
        {
          t: 1,
          duration,
          ease: 'power2.inOut', // the requested fast-travel easing
          onUpdate: () => {
            const nx = from.x + (landX - from.x) * p.t
            const ny = from.y + (landY - from.y) * p.t - lift * Math.sin(Math.PI * p.t) // arc
            const now = performance.now()
            const dtSec = Math.max(0.001, (now - lastMs) / 1000)
            g.vx = (nx - lastX) / dtSec // drives the camera look-ahead
            lastX = nx
            lastMs = now
            g.x = nx
            g.feetY = ny

            // lean into the flight and scale the flame with the speed
            const speed = Math.min(1, Math.abs(g.vx) / 1800)
            jet.style.transform = `rotate(${(8 + speed * 22).toFixed(1)}deg)`
            jet.style.setProperty('--thrust', (0.75 + speed * 0.9).toFixed(2))

            sparkClock += dtSec
            while (sparkClock > 0.028) {
              sparkClock -= 0.028
              emitSpark(g.x - dir * 22 + (Math.random() - 0.5) * 6, g.feetY - 40, dir)
            }
          },
        },
        0.16, // short ignition before lift-off
      )
    }
    travelRef.current = travelTo

    /* ----------------------------------------------------------- step ---- */

    const step = (dt) => {
      if (g.phase !== 'done') {
        lockCamera()
        if (g.phase === 'fall') stepFall(dt)
        return
      }

      if (g.flying) {
        // the GSAP tween owns x / y; the camera chases the alien fast and smoothly
        const kx = 1 - Math.exp(-dt * 11)
        const ky = 1 - Math.exp(-dt * 8)
        g.camX += (g.x + clamp(g.vx * 0.2, -170, 170) - g.camX) * kx
        g.camY += (g.feetY - CAM_LIFT - g.camY) * ky
        return
      }

      const { input } = g
      const dirInput = (input.right ? 1 : 0) - (input.left ? 1 : 0)
      const seg = segmentAt(g.x)
      const maxV = seg.stairs ? STAIR_SPEED : WALK_SPEED

      g.vx = approach(g.vx, dirInput * maxV, (dirInput !== 0 ? ACCEL : DECEL) * dt)
      g.x = clamp(g.x + g.vx * dt, LEVEL.minX, LEVEL.maxX)
      if (g.x === LEVEL.minX || g.x === LEVEL.maxX) {
        if ((g.x === LEVEL.minX && g.vx < 0) || (g.x === LEVEL.maxX && g.vx > 0)) g.vx = 0
      }

      if (dirInput !== 0 && g.dir !== dirInput) {
        g.dir = dirInput
        flip.dataset.dir = String(dirInput)
      }

      // feet follow the surface; the ease turns each stair step into a small hop
      const cur = segmentAt(g.x)
      const targetY = surfaceY(cur, g.x) + 2
      const dy = targetY - g.feetY
      g.feetY = Math.abs(dy) < 0.05 ? targetY : g.feetY + dy * (1 - Math.exp(-dt * 22))

      // sprite state machine: IDLE / STAIRS / WALK
      const moving = dirInput !== 0 && Math.abs(g.vx) > 12
      setState(
        !moving ? ALIEN_STATE.IDLE : cur.stairs ? ALIEN_STATE.STAIRS : ALIEN_STATE.WALK,
      )

      // tutorial: first time the alien steps off the stairs onto a platform
      if (g.wasOnStairs && !cur.stairs && !g.tutorialSeen) {
        g.tutorialSeen = true
        setShowTutorial(true)
      }
      g.wasOnStairs = cur.stairs

      // keep the walk cycle in sync with the real speed (no moon-walking)
      if (moving) {
        if (!animWalk && stripWalkRef.current?.getAnimations) {
          animWalk = stripWalkRef.current.getAnimations({ subtree: true })[0] || null
          animStairs = stripStairsRef.current.getAnimations({ subtree: true })[0] || null
        }
        const ratio = clamp(Math.abs(g.vx) / (cur.stairs ? STAIR_SPEED : WALK_SPEED), 0.45, 1.15)
        if (cur.stairs) {
          if (animStairs && Math.abs(ratio - stairsRate) > 0.04) {
            animStairs.playbackRate = stairsRate = ratio
          }
        } else if (animWalk && Math.abs(ratio - walkRate) > 0.04) {
          animWalk.playbackRate = walkRate = ratio
        }
      }

      // camera: smooth follow with a little look-ahead so the path ahead is revealed
      const kx = 1 - Math.exp(-dt * 4.2)
      const ky = 1 - Math.exp(-dt * 3.2)
      g.camX += (g.x + clamp(g.vx * 0.38, -170, 170) - g.camX) * kx
      g.camY += (g.feetY - CAM_LIFT - g.camY) * ky

      // proximity trigger (with hysteresis so the card never flickers)
      let nearest = -1
      let best = g.active >= 0 ? PROXIMITY_LEAVE : PROXIMITY_ENTER
      if (g.active >= 0) {
        const d = Math.abs(g.x - LEVEL.platforms[g.active].cx)
        if (d < PROXIMITY_LEAVE) {
          nearest = g.active
          best = d
        }
      }
      if (nearest < 0) {
        best = PROXIMITY_ENTER
        for (let i = 0; i < LEVEL.platforms.length; i++) {
          const d = Math.abs(g.x - LEVEL.platforms[i].cx)
          if (d < best) {
            best = d
            nearest = i
          }
        }
      }
      if (nearest !== g.active) {
        g.active = nearest
        setUi((s) => ({ active: nearest, shown: nearest >= 0 ? nearest : s.shown }))
        if (nearest >= 0) {
          setVisited((v) => (v[nearest] ? v : v.map((x, i) => x || i === nearest)))
        }
      }
    }

    const loop = (t) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min((t - prev) / 1000, 0.05)
      prev = t
      step(dt)
      paint()
    }
    const start = () => {
      if (raf || document.hidden) return
      if (!visible && g.phase !== 'fall') return
      prev = performance.now()
      raf = requestAnimationFrame(loop)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    // run only while the section is on screen
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        g.capture = entry.intersectionRatio > 0.45
        if (visible || g.phase === 'fall') start()
        else stop()
      },
      { threshold: [0, 0.2, 0.45, 0.7] },
    )
    io.observe(section)

    const ro = new ResizeObserver(measure)
    ro.observe(viewport)

    // keyboard (layout independent via e.code, so it works on the Arabic layout too)
    const KEYS = {
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
    }
    const onKeyDown = (e) => {
      if (g.phase === 'peek' && ['Space', 'PageDown', 'ArrowDown', 'End'].includes(e.code)) {
        e.preventDefault()
        startFall()
        return
      }
      if (!g.capture || e.metaKey || e.ctrlKey || e.altKey) return
      // 1-8 = jetpack straight to that cookie
      const digit = /^(?:Digit|Numpad)([1-8])$/.exec(e.code)
      if (digit) {
        e.preventDefault()
        travelTo(Number(digit[1]) - 1)
        return
      }
      const side = KEYS[e.code]
      if (!side) return
      e.preventDefault()
      setInput(side, true)
    }
    const onKeyUp = (e) => {
      const side = KEYS[e.code]
      if (side) setInput(side, false)
    }
    const releaseAll = () => {
      setInput('left', false)
      setInput('right', false)
    }
    const onVisibility = () => {
      if (document.hidden) {
        stop()
        releaseAll()
      } else start()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseAll)
    document.addEventListener('visibilitychange', onVisibility)

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })

    measure()
    if (g.phase === 'done') snapCamera()
    paint()
    onScroll()

    return () => {
      travelRef.current = null
      flight?.kill()
      zoomTween?.kill()
      g.flying = false
      g.zoomFx = 1
      stopPageFollow(false)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      stop()
      io.disconnect()
      ro.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseAll)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [setInput, dismissTutorial])

  /* --------------------------------------------------------------- orders */

  const handleOrder = () => {
    setOrdered(COOKIES[ui.shown].id)
  }

  const card = COOKIES[ui.shown]
  const cardOpen = ui.active >= 0
  const storyOpen = ordered === card.id
  const visitedCount = visited.filter(Boolean).length
  const lastPlatform = LEVEL.platforms[LEVEL.platforms.length - 1]
  const firstPlatform = LEVEL.platforms[0]

  /* ----------------------------------------------------------------- view */

  return (
    <section
      className="game"
      ref={sectionRef}
      dir="ltr"
      data-intro={introInit}
      aria-label="لعبة كوكي نوفا التفاعلية"
    >
      <div className="game__viewport" ref={viewportRef}>
        {/* ---------- parallax backdrop ---------- */}
        <div className="bg" aria-hidden="true">
          <div className="bg__planets" ref={planetsRef} />
          <div className="bg__shade" />
          <div className="bg__stars bg__stars--far" ref={starsFarRef} />
          <div className="bg__stars bg__stars--near" ref={starsNearRef} />
        </div>

        {/* ---------- the world (moved by the camera) ---------- */}
        <div
          className="world"
          ref={worldRef}
          style={{ width: LEVEL.width, height: LEVEL.height }}
        >
          {LEVEL.platforms.map((p, i) => (
            <div
              className="platform"
              key={`p${i}`}
              style={{
                left: p.x,
                top: p.y,
                width: p.w,
                height: LV.platformH,
                '--neon': p.color,
                '--d': `${i * 0.35}s`,
              }}
            >
              <i className="platform__aura" />
              <div className="platform__body">
                <i className="platform__chase" />
              </div>
              <i className="platform__neon" />
            </div>
          ))}

          {LEVEL.stairs.map((s) => {
            const sw = (s.x1 - s.x0) / LV.steps
            const sh = (s.y1 - s.y0) / LV.steps
            return Array.from({ length: LV.steps }, (_, k) => (
              <div
                className="tread"
                key={`s${s.index}-${k}`}
                style={{
                  left: s.x0 + k * sw,
                  top: s.y0 + (k + 1) * sh,
                  width: sw + 2,
                  height: LV.treadH,
                  '--neon': mixHex(s.from, s.to, (k + 0.5) / LV.steps),
                  '--d': `${(s.index * LV.steps + k) * 0.11}s`,
                }}
              >
                <i className="tread__aura" />
              </div>
            ))
          })}

          <div
            className="sign"
            style={{ left: firstPlatform.x + 36, top: firstPlatform.y - 96 }}
            dir="rtl"
          >
            <span>ابدأ</span>
            <ArrowIcon flip />
          </div>
          <div
            className="sign sign--end"
            style={{ left: lastPlatform.x + lastPlatform.w - 150, top: lastPlatform.y - 96 }}
            dir="rtl"
          >
            <span>النهاية</span>
          </div>

          {COOKIES.map((c, i) => {
            const p = LEVEL.platforms[i]
            const active = ui.active === i
            return (
              <div
                className={`cookie${active ? ' is-active' : ''}`}
                key={c.id}
                style={{
                  left: p.cx - LV.cookieW / 2,
                  top: p.y - LV.cookieH + 19,
                  width: LV.cookieW,
                  height: LV.cookieH,
                }}
              >
                <i className="cookie__halo" />
                <div className="cookie__float">
                  <img
                    className="cookie__img"
                    src={`/images/${c.file}`}
                    alt=""
                    width={COOKIE_PX.w}
                    height={COOKIE_PX.h}
                    loading="lazy"
                    decoding="async"
                    draggable="false"
                  />
                </div>
                <i className="cookie__spark cookie__spark--1" />
                <i className="cookie__spark cookie__spark--2" />
                <i className="cookie__spark cookie__spark--3" />
                <i className="cookie__spark cookie__spark--4" />
                <i className="cookie__pedestal" style={{ '--neon': p.color }} />
              </div>
            )
          })}

          {/* alien: origin of this box is the character's feet */}
          <div className="alien" ref={alienRef} data-state="idle">
            <i className="alien__aura" />
            <i className="alien__shadow" />
            <div className="alien__land" ref={landRef}>
              <div className="alien__flip" ref={flipRef} data-dir="1">
                <Sprite name="idle" data={sprites.idle} />
                <div ref={stripStairsRef} className="alien__rate">
                  <Sprite name="stairs" data={sprites.stairs} />
                </div>
                <div ref={stripWalkRef} className="alien__rate">
                  <Sprite name="walking" data={sprites.walking} />
                </div>
                {/* jetpack flight: side-view pose frozen on one frame + backpack + flame */}
                <div className="jet" ref={jetRef}>
                  <i className="jet__glow" />
                  <i className="jet__pack" />
                  <i className="jet__flame" />
                  <Sprite name="jet" data={sprites.walking} frame={4} />
                </div>
              </div>
            </div>
          </div>

          {/* ember pool for the jetpack trail */}
          {Array.from({ length: SPARK_COUNT }, (_, i) => (
            <i
              className="fx-spark"
              key={`sp${i}`}
              ref={(el) => {
                sparkRefs.current[i] = el
              }}
            />
          ))}

          {dust && (
            <div
              className="dust"
              key={dust.n}
              style={{ left: dust.x, top: dust.y }}
            >
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          )}
        </div>

        {/* ---------- arcade finish: scanlines + vignette ---------- */}
        <div className="crt" aria-hidden="true" />

        {/* ---------- progress ---------- */}
        <div className="progress" dir="rtl" aria-live="polite">
          <span className="progress__label">الكوكيز</span>
          <span className="progress__pips" aria-hidden="true">
            {visited.map((v, i) => (
              <i key={i} className={v ? 'is-on' : ''} style={{ '--neon': PALETTE[i % 4] }} />
            ))}
          </span>
          <span className="progress__count">
            {visitedCount}/{COOKIES.length}
          </span>
        </div>

        {/* ---------- pixel dialogue card ---------- */}
        <aside
          className={`card${cardOpen ? ' is-open' : ''}${storyOpen ? ' is-story' : ''}`}
          dir="rtl"
          aria-hidden={!cardOpen}
        >
          <div className="card__frame">
            <div className="card__art">
              <i className="card__artglow" />
              <img
                src={`/images/${card.file}`}
                alt={cardOpen ? card.name : ''}
                width={COOKIE_PX.w}
                height={COOKIE_PX.h}
                loading="lazy"
                decoding="async"
                draggable="false"
              />
            </div>
            <div className="card__body">
              <p className="card__tag">
                كوكي {ui.shown + 1} / {COOKIES.length}
              </p>
              <h3 className="card__name" dir="ltr">
                {card.name}
              </h3>
              <p className="card__price">
                <b>{card.price.toLocaleString('en-US')}</b> {CURRENCY}
              </p>
              {storyOpen ? (
                <p className="card__blurb">{card.blurb}</p>
              ) : (
                <button
                  type="button"
                  className="card__order"
                  onClick={handleOrder}
                  tabIndex={cardOpen ? 0 : -1}
                >
                  دوس هنا
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* ---------- HUD controller ---------- */}
        <div className="hud" data-tutorial={showTutorial}>
          {showTutorial && (
            <div className="tutorial" dir="rtl" role="dialog" aria-label="تنبيه">
              <p className="tutorial__text">
                <span className="tutorial__lead">💡 تنبيه:</span> اذا مابيك حيل تتمشى تقدر تضغط
                على رقم الكوكي حتى تطيرله رأسا
              </p>
              <button type="button" className="tutorial__ok" onClick={dismissTutorial}>
                فهمت!
              </button>
            </div>
          )}

          <div className={`hint${started ? ' is-hidden' : ''}`} dir="rtl" aria-hidden={started}>
            <span>استخدم الأسهم</span>
            <span className="hint__keys" dir="ltr">
              <ArrowIcon />
              <ArrowIcon flip />
            </span>
            <span>للتحرك</span>
          </div>

          <div className="hud__bar">
            <button
              type="button"
              className="pad pad--left"
              ref={leftBtnRef}
              aria-label="تحرك لليسار"
              data-pressed="false"
              {...holdProps('left')}
            >
              <ArrowIcon />
            </button>

            {/* quick-select: jetpack straight to a cookie (also keys 1-8) */}
            <div className="quick" role="group" aria-label="طيران سريع إلى الكوكيز">
              {COOKIES.map((c, i) => (
                <button
                  type="button"
                  key={c.id}
                  className={[
                    'quick__btn',
                    visited[i] ? 'is-visited' : '',
                    ui.active === i ? 'is-current' : '',
                    flyTarget === i ? 'is-target' : '',
                  ].join(' ')}
                  style={{ '--neon': PALETTE[i % PALETTE.length] }}
                  aria-label={`الطيران إلى ${c.name} (${i + 1})`}
                  title={`${i + 1} · ${c.name}`}
                  onClick={(e) => {
                    travelRef.current?.(i)
                    if (e.detail > 0) e.currentTarget.blur() // mouse/touch: don't keep focus
                  }}
                >
                  <img
                    className="quick__thumb"
                    src={`/images/${c.file}`}
                    alt=""
                    width={COOKIE_PX.w}
                    height={COOKIE_PX.h}
                    loading="lazy"
                    decoding="async"
                    draggable="false"
                  />
                  <b className="quick__num">{i + 1}</b>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="pad pad--right"
              ref={rightBtnRef}
              aria-label="تحرك لليمين"
              data-pressed="false"
              {...holdProps('right')}
            >
              <ArrowIcon flip />
            </button>
          </div>
        </div>
      </div>

      {/* ---------- intro: waving from under the hero, then drops into the game ---------- */}
      <div className="peek" ref={peekRef} aria-hidden="true">
        <div className="peek__bubble" dir="rtl">
          <p className="bubble__text">
            شوفني <mark>هنا!</mark> تعال انزل وشوف شنو عدنا
          </p>
        </div>
        <div className="peek__body" ref={peekBodyRef}>
          <Sprite name="wave" data={sprites.wave} />
          <Sprite name="idle" data={sprites.idle} />
        </div>
      </div>
    </section>
  )
}

export default InteractiveGame
