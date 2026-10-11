/** Full-screen loading screen shown while we check who is signed in. */
export function Preloader() {
  return (
    <div className="ms-preloader" role="status" aria-label="Loading">
      <div className="ms-preloader-mark">
        <div className="ms-ring2" />
        <div className="ms-ring" />
        <img src="/fleet-logo.png" alt="" />
      </div>
      <div className="ms-preloader-text">LOADING</div>
    </div>
  )
}
