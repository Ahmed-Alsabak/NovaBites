import './StairPath.css'

const PLATFORM_COUNT = 8
const PLATFORMS = Array.from({ length: PLATFORM_COUNT }, (_, index) => index)

function StairPath() {
  return (
    <section className="stair-path" dir="ltr">
      <div className="alien-character">
        <img src="/images/alien.png" alt="الفضائي" />
      </div>

      <ol className="stair-path__steps">
        {PLATFORMS.map((index) => (
          <li
            className="platform"
            key={index}
            style={{ '--i': index }}
            data-platform={index}
          >
            <div className="platform__slot" />
            <div className="platform__ledge" />
          </li>
        ))}
      </ol>
    </section>
  )
}

export default StairPath
