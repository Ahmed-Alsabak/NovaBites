import './Hero.css'

const COOKIE_W = 409
const COOKIE_H = 610
const SPACE_W = 1920
const SPACE_H = 1080

const COOKIES = [
  'SimpleCookie.webp',
  'KIKICookie.webp',
  'SnickersCookie.webp',
  'NewYorkcookie.webp',
  'SunsetCookie.webp',
  'CoalCookie.webp',
  'WhiteCookie.webp',
  'DollarCookie.webp',
]

function Hero() {
  return (
    <>
      <div className="bg-layers" aria-hidden="true">
        <img
          className="bg-layer bg-galaxy"
          src="/images/pxsprite-space%201.webp"
          alt=""
          width={SPACE_W}
          height={SPACE_H}
          fetchPriority="high"
          loading="eager"
          decoding="async"
        />
      </div>

      <section className="hero" dir="rtl">
        <h1 className="hero__title">الف هلا بنوفا بايتس</h1>

        <ul className="hero__cookies" dir="ltr">
          {COOKIES.map((file) => (
            <li className="hero__cookie" key={file}>
              <img
                src={`/images/${file}`}
                alt={file.replace('.webp', '')}
                width={COOKIE_W}
                height={COOKIE_H}
                fetchPriority="high"
                loading="eager"
                decoding="async"
              />
            </li>
          ))}
        </ul>

        <h2 className="hero__subtitle">
          <span className="hero__hot">
            <span className="hero__fresh">فريش</span>
            <del>حار</del>
          </span>{' '}
          <span className="hero__gaf-word">ومكسب</span> ورخيص
        </h2>
      </section>
    </>
  )
}

export default Hero
