import React from "react";
import { Container, Row, Col, Button, Card, Badge } from "react-bootstrap";
import { Link } from "react-router-dom";
import img2 from "../../../assets/portrait-business-person-work.jpg";
import img3 from "../../../assets/group-people-with-laptops.jpg";
import img4 from "../../../assets/businessman-using-laptop.jpg";
import "./LandingPage.css";
import HeroImage from "../../../assets/Financial dashboard on sleek tablet.png";
import Cloud1 from "../../../assets/cloud1.png";
import FaqBg from "../../../assets/faq.png";
import WhoWEAre from "../../../assets/who-we-are.jpeg";
import CloudLine from "../../../assets/clouds-bg-line.png";
export default function LandingPage() {
  return (
    <>
      {/* HERO */}
      <section className="overflow-hidden position-relative bg-hero  min-vh-80">
        <div className="position-absolute top-0 start-0 w-100 h-100 pointer-events-none banner-bg">
          <img
            src={Cloud1}
            className="position-absolute animate-cloud-circle"
            style={{ width: "30%", top: "0", left: "15%" }}
            alt=""
          />
          <img
            src={Cloud1}
            className="position-absolute animate-cloud-circle-reverse"
            style={{ width: "45%", top: "20%", left: "0" }}
            alt=""
          />
          <img
            src={Cloud1}
            className="position-absolute animate-cloud-circle-slow"
            style={{ width: "40%", top: "0", left: "25%" }}
            alt=""
          />
             <img
            src={Cloud1}
            className="position-absolute animate-cloud-circle-slow"
            style={{ width: "45%", top: "0", left: "70%" }}
            alt=""
          />
             <img
            src={Cloud1}
            className="position-absolute animate-cloud-circle-reverse"
            style={{ width: "45%", top: "10%", left: "60%" }}
            alt=""
          />
        </div>

        <div className="position-relative h-100">
          <div className="row align-items-center h-100">
            <div className="col-lg-6 py-5 px-4 px-md-4 px-lg-5 g-0" style={{ zIndex: 2 }}>
              <h1 className="fw-bold display-5 mb-4">
                Your All-In-One <br />
                <span className="text-gradient">Client Management & </span>
                <br className="d-none d-md-block" />
                Administrative Cloud
              </h1>
              <p className="lead text-muted mb-5" style={{ maxWidth: '550px' }}>
                Organize client files, generate documents, streamline workflows, and manage operations — all from one secure platform.
              </p>
              <div className="d-flex gap-md-3 gap-1 flex-wrap">
                <Link to="/login" className="d-flex p-3 btn btn-primary btn-md-lg btn-sm fw-bold px-md-5 py-md-3 rounded-pill shadow-sm hover-lift">
                  Access Portal <span className="d-none d-md-block"> &rarr;</span>
                </Link>
                <Link to="/signup/consumer" className="d-flex p-3 btn btn-outline-primary btn-md-lg btn-sm fw-bold px-md-5 py-md-3 rounded-pill shadow-sm hover-lift">
                  Create Account <span className="d-none d-md-block"> &rarr;</span>
                </Link>
                
              </div>
            </div>

            <div className="col-lg-6 d-none d-lg-flex align-items-center position-absolute end-0 top-0 h-100 g-0" style={{ zIndex: 5 }}>
              <img
                src={HeroImage}
                className="w-100 img-fluid object-fit-cover"
                alt="Product"
              />
            </div>
          </div>
        </div>
             <div className="position-absolute left-0 right-0 bottom-0 w-100 h-50 z-1">
          <img src={CloudLine} className="position-absolute left-0 right-0 bottom-0 w-100" alt="" />
        </div>
      </section>
      {/* WHO WE ARE */}
      <section className="who-we-are position-relative">
        <img src={FaqBg} className="faq-bg" alt="" />

        <div className="container h-100">
          <div className="row h-100">
            {/* CONTENT */}
            <div className="col-lg-6 how-it-works-section d-flex justify-content-center">
              <div className="content-col">
                <h6 className="text-gradient fw-semibold">WHO WE ARE</h6>
                <h1 className="how-it-works-title fw-bold mb-4 mb-md-5">
                  Administrative Infrastructure for Financial & Operational
                  Workflows
                </h1>

                <p>
                  We are a backend infrastructure platform designed to{" "}
                  <span className="text-gradient fw-semibold">
                    support individuals, service providers, and growth-focused
                    operators
                  </span>
                  .
                </p>

                <p>
                  We provide tools and administrative assistance that reduce
                  operational friction without replacing professional judgment.
                </p>
                <p>
                  {" "}
                  We{" "}
                  <span class="inline font-semibold text-gradient">
                    {" "}
                    provide organized systems and administrative support
                  </span>
                   &nbsp;to help users and partners manage complex financial and
                  operational workflows with clarity and consistency.
                </p>
                <div className="mt-4 d-flex gap-3 align-items-center">
                  <Link to="https://web.hiddenpartnercloud.com/assessment" className="btn btn-primary rounded-pill">
                    GET MY ASSESSMENT →
                  </Link>
                  <Link
                    to="/login"
                    className="fw-semibold text-dark text-decoration-none"
                  >
                    Login →
                  </Link>
                </div>
              </div>
            </div>
            {/* IMAGE */}
            <div className="col-lg-1"></div>
            <div className="col-lg-5 d-flex justify-content-center align-items-center"><img src={WhoWEAre} alt="" srcset="" className="img-fluid rounded-circle h-80 my-auto" /></div>
            
            {/* <div
              className="col-lg-5 d-none d-lg-block"
              style={{
                backgroundImage: `url(${WhoWEAre})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                borderRadius:"50%",
                backgroundRepeat: "no-repeat",
              }}
            /> */}
          </div>
        </div>
      </section>

      {/* === SECTION 1: THE 3 PORTALS === */}
      <section className="py-5 services-section position-relative">
        <Container className="py-5 circle-bg">
          <div className="text-center mb-5 animate-fade-up">
            <h6 className="text-gradient fw-bold text-uppercase letter-spacing-1">
              Choose Your Workspace
            </h6>
            <h2 className="fw-bold display-6 text-black">
              Comprehensive Solutions <br /> Powered By <span className="text-gradient">Hidden Partner Cloud</span> 
            </h2>
             <h6 className="fw-bold text-uppercase letter-spacing-1 text-black mt-3">
              Empowering Consumer, Partner, Business with our all-in-one plateform
            </h6>
          </div>

          <Row className="g-4">
            {/* Consumer Portal */}
            <Col md={4} className="animate-fade-up delay-1">
              <Card
                className="h-100 card-bg-image hover-card"
                style={{
                  backgroundImage: `url(${img3})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <Card.Body className="card-body-overlay d-flex flex-column text-center justify-content-center">

                  <div className="mt-auto d-grid gap-2">
                    <Link
                      to="/login"
                      className="btn btn-primary rounded-pill fw-bold shadow-sm"
                    >
                      Login →
                    </Link>

                    <Link
                      to="/signup/consumer"
                      className="btn btn-outline-light rounded-pill fw-bold btn-sm"
                    >
                      New? Sign Up
                    </Link>
                  </div>
                </Card.Body>
                <Card.Footer className="text-white who-we-are text-center">
                  Consumer
                </Card.Footer>
              </Card>
            </Col>
            <Col md={4} className="animate-fade-up delay-1">
              <Card
                className="h-100 card-bg-image hover-card"
                style={{
                  backgroundImage: `url(${img2})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <Card.Body className="card-body-overlay d-flex flex-column text-center justify-content-center">

                  <div className="mt-auto d-grid gap-2">
                    <Link
                      to="/login"
                      className="btn btn-primary rounded-pill fw-bold shadow-sm"
                    >
                      Login →
                    </Link>

                    <Link
                       to="/signup/partner"
                      className="btn btn-outline-light rounded-pill fw-bold btn-sm"
                    >
                      New? Sign Up
                    </Link>
                  </div>
                </Card.Body>
                <Card.Footer className="text-white who-we-are text-center">
                  Partner
                </Card.Footer>
              </Card>
            </Col>
            <Col md={4} className="animate-fade-up delay-1">
              <Card
                className="h-100 card-bg-image hover-card"
                style={{
                  backgroundImage: `url(${img4})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  height: "400",
                }}
              >
                <Card.Body className="card-body-overlay d-flex flex-column text-center justify-content-center">
                  <div className="mt-auto d-grid gap-2">
                    <Link
                      to="/login"
                      className="btn btn-primary rounded-pill fw-bold shadow-sm"
                    >
                      Login →
                    </Link>

                    <Link
                     to="/signup/affiliate"
                      className="btn btn-outline-light rounded-pill fw-bold btn-sm"
                    >
                      New? Sign Up
                    </Link>
                  </div>
                </Card.Body>
                <Card.Footer className="text-white who-we-are text-center">
                  Business
                </Card.Footer>
              </Card>
            </Col>
        
          </Row>
        </Container>
      </section>      
      {/* FEATURES / svg icons */}
      <section className="how-it-works-section who-we-are text-white position-relative">
        <div className="position-relative">
          <img src={FaqBg} className="faq-bg2" alt="" />
        </div>

        <div className="container-xl text-center">
          <h1 className="how-it-works-title fw-bold mb-4 mb-md-5 text-gradient">
            How It Works
          </h1>

          <div className="row g-4 g-lg-5">
            {/* Step 1 */}
            <div className="col-12 col-sm-6 col-lg text-center">
              <div className="d-flex flex-column align-items-center">
                <div className="icon-box mb-2 mb-md-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1"
                    stroke="white"
                    class="w-full h-full"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    ></path>
                  </svg>
                </div>
                <h3 className="mt-md-4 fs-5 fw-semibold">
                  Review &amp; Classify
                </h3>
                <p className="mt-2 small">
                  Securely review and classify business data for accuracy.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="col-12 col-sm-6 col-lg text-center">
              <div className="d-flex flex-column align-items-center">
                <div className="icon-box mb-2 mb-md-4 d-flex align-items-center justify-content-center">
                  <svg
                    viewBox="0 0 15 13"
                    class="w-16 h-16 scale-90"
                    fill="white"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <path
                      d="M1 2C0.447715 2 0 2.44772 0 3V12C0 12.5523 0.447715 13 1 13H14C14.5523 13 15 12.5523 15 12V3C15 2.44772 14.5523 2 14 2H1ZM1 3L14 3V3.92494C13.9174 3.92486 13.8338 3.94751 13.7589 3.99505L7.5 7.96703L1.24112 3.99505C1.16621 3.94751 1.0826 3.92486 1 3.92494V3ZM1 4.90797V12H14V4.90797L7.74112 8.87995C7.59394 8.97335 7.40606 8.97335 7.25888 8.87995L1 4.90797Z"
                      fill="white"
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                    ></path>
                  </svg>
                </div>
                <h3 className="mt-md-4 fs-5 fw-semibold">Admin Support</h3>
                <p className="mt-2 small">
                  Support administrative processing with guided tools.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="col-12 col-sm-6 col-lg text-center">
              <div className="d-flex flex-column align-items-center">
                <div className="icon-box mb-2 mb-md-4">
                  <svg
                    width="100%"
                    height="auto"
                    viewBox="0 0 58 60"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <rect
                      x="1"
                      y="1"
                      width="24"
                      height="26"
                      rx="2"
                      stroke="#fff"
                      stroke-width="2"
                    ></rect>
                    <path
                      d="M14.6146 17.1967C14.8371 17.4191 14.8392 17.7843 14.5838 17.9678C13.9915 18.3933 13.2769 18.6264 12.5382 18.6264C11.6083 18.6264 10.7165 18.257 10.059 17.5994C9.40148 16.9419 9.03209 16.0501 9.03209 15.1203C9.03209 14.3816 9.26519 13.667 9.69065 13.0747C9.87417 12.8192 10.2393 12.8214 10.4617 13.0438L14.6146 17.1967Z"
                      fill="#0ea5e9"
                    ></path>
                    <path
                      d="M9.94096 17.0091L10.6493 17.7175L9.11456 19.2522C8.91896 19.4478 8.60183 19.4478 8.40622 19.2522C8.21062 19.0566 8.21062 18.7395 8.40622 18.5439L9.94096 17.0091Z"
                      fill="#fff"
                    ></path>
                    <path
                      d="M12.4851 11.0203C12.2627 10.7978 12.2605 10.4327 12.516 10.2492C13.1082 9.82372 13.8229 9.59062 14.5615 9.59062C15.4914 9.59062 16.3832 9.96001 17.0407 10.6175C17.6983 11.275 18.0676 12.1668 18.0676 13.0967C18.0676 13.8354 17.8345 14.55 17.4091 15.1423C17.2256 15.3977 16.8604 15.3956 16.638 15.1732L12.4851 11.0203Z"
                      fill="#fff"
                    ></path>
                    <path
                      d="M17.1588 11.2077L16.4504 10.4994L17.6015 9.34833C17.7482 9.20163 18.0257 9.24127 18.2213 9.43688C18.4169 9.63248 18.4565 9.90997 18.3098 10.0567L17.1588 11.2077Z"
                      fill="#fff"
                    ></path>
                    <path
                      d="M12.5383 12.7575C12.7339 12.5619 13.051 12.5619 13.2466 12.7575C13.4422 12.9531 13.4422 13.2702 13.2466 13.4658L12.0661 14.6464L11.3577 13.9381L12.5383 12.7575Z"
                      fill="#ADAAFF"
                    ></path>
                    <path
                      d="M12.5382 12.758C12.7338 12.5624 13.051 12.5624 13.2466 12.758C13.4422 12.9536 13.4422 13.2708 13.2466 13.4664L12.066 14.6469L11.3577 13.9386L12.5382 12.758Z"
                      fill="#fff"
                    ></path>
                    <path
                      d="M14.309 14.5276C14.5046 14.332 14.8217 14.332 15.0173 14.5276C15.2129 14.7232 15.2129 15.0403 15.0173 15.2359L13.8368 16.4165L13.1284 15.7081L14.309 14.5276Z"
                      fill="#fff"
                    ></path>
                    <rect
                      x="31"
                      y="23"
                      width="27"
                      height="37"
                      rx="3"
                      fill="#fff"
                    ></rect>
                    <path
                      d="M44.7681 36C43.323 36 42.1462 37.1768 42.1462 38.6219C42.1462 39.4842 42.5743 40.2411 43.2196 40.7194L41.925 42.8578C41.9148 42.8548 41.9035 42.8527 41.8923 42.8496C41.6219 42.7769 41.3402 42.8169 41.0975 42.9561C40.5967 43.246 40.4236 43.8892 40.7124 44.39C40.906 44.7259 41.2593 44.9144 41.6219 44.9144C41.8001 44.9144 41.9814 44.8703 42.1462 44.7751C42.389 44.6348 42.5651 44.4064 42.6378 44.136C42.7106 43.8656 42.6716 43.584 42.5313 43.3412C42.4873 43.2654 42.4269 43.1979 42.3675 43.1364L43.7931 40.7931L43.9324 40.5637L43.703 40.4326C43.0854 40.068 42.6706 39.3931 42.6706 38.6219C42.6706 37.4605 43.6067 36.5244 44.7681 36.5244C45.9295 36.5244 46.8656 37.4605 46.8656 38.6219C46.8656 38.838 46.8359 39.0408 46.7755 39.2364L47.2753 39.392C47.3511 39.1473 47.39 38.8902 47.39 38.6219C47.39 37.1768 46.2132 36 44.7681 36ZM44.7681 37.5731C44.1895 37.5731 43.7194 38.0432 43.7194 38.6219C43.7194 39.2005 44.1895 39.6706 44.7681 39.6706C44.8552 39.6706 44.9412 39.6583 45.0221 39.6378L46.2839 41.9238L46.4068 42.1532L46.6444 42.0303C46.9445 41.8644 47.2845 41.7681 47.6522 41.7681C48.8136 41.7681 49.7497 42.7042 49.7497 43.8656C49.7497 45.027 48.8136 45.9631 47.6522 45.9631C47.0858 45.9631 46.5717 45.7368 46.1938 45.3732L45.8333 45.7501C46.3044 46.2038 46.9475 46.4875 47.6522 46.4875C49.0973 46.4875 50.274 45.3107 50.274 43.8656C50.274 42.4205 49.0973 41.2437 47.6522 41.2437C47.2886 41.2437 46.9516 41.339 46.6362 41.4732L45.4809 39.3839C45.6858 39.1923 45.8169 38.924 45.8169 38.6219C45.8169 38.0432 45.3468 37.5731 44.7681 37.5731ZM40.9828 41.3175C39.8408 41.6022 39 42.6397 39 43.8656C39 45.3107 40.1768 46.4875 41.6219 46.4875C42.9738 46.4875 44.0563 45.4439 44.1946 44.1278H46.6444C46.7611 44.5795 47.1647 44.9144 47.6522 44.9144C48.2308 44.9144 48.7009 44.4443 48.7009 43.8656C48.7009 43.287 48.2308 42.8169 47.6522 42.8169C47.1647 42.8169 46.7611 43.1518 46.6444 43.6034H43.7194V43.8656C43.7194 45.027 42.7833 45.9631 41.6219 45.9631C40.4605 45.9631 39.5244 45.027 39.5244 43.8656C39.5244 42.8804 40.2024 42.061 41.1139 41.8337L40.9828 41.3175Z"
                      fill="#0ea5e9"
                    ></path>
                    <rect
                      x="32"
                      y="1"
                      width="25"
                      height="16"
                      rx="2"
                      stroke="#fff"
                      stroke-width="2"
                    ></rect>
                    <g clip-path="url(#clip0_971_7928)">
                      <path
                        d="M42.9 9.52246C42.3264 9.52246 41.8348 10.0141 41.8348 10.5876V13.2422C41.8348 13.8158 42.3264 14.3074 42.9 14.3074C43.4735 14.3074 43.9651 13.8158 43.9651 13.2422V10.5876C43.9651 9.98129 43.5063 9.52246 42.9 9.52246Z"
                        fill="#fff"
                      ></path>
                      <path
                        d="M39.1638 10.5876C39.1638 11.1611 39.6554 11.6527 40.229 11.6527C40.8025 11.6527 41.2941 11.1611 41.2941 10.5876V9.52246H40.2453C39.6554 9.52246 39.1638 9.98129 39.1638 10.5876Z"
                        fill="#fff"
                      ></path>
                      <path
                        d="M42.9 4.16406C42.3264 4.16406 41.8348 4.65566 41.8348 5.2292C41.8348 5.80273 42.3264 6.29433 42.9 6.29433H43.9651C43.9651 5.68802 43.9651 5.83551 43.9651 5.2292C43.9651 4.65566 43.5063 4.16406 42.9 4.16406Z"
                        fill="#fff"
                      ></path>
                      <path
                        d="M40.229 8.96523H42.9C43.4735 8.96523 43.9651 8.47363 43.9651 7.9001C43.9651 7.32656 43.4735 6.83496 42.9 6.83496H40.229C39.6554 6.83496 39.1638 7.32656 39.1638 7.9001C39.1638 8.47363 39.6226 8.96523 40.229 8.96523Z"
                        fill="#fff"
                      ></path>
                      <path
                        d="M48.242 6.83496C47.6685 6.83496 47.1769 7.32656 47.1769 7.9001V8.96523H48.242C48.8156 8.96523 49.3072 8.47363 49.3072 7.9001C49.3072 7.32656 48.8319 6.83496 48.242 6.83496Z"
                        fill="#fff"
                      ></path>
                      <path
                        d="M44.5222 5.2292V7.90023C44.5222 8.47376 45.0138 8.96536 45.5874 8.96536C46.1609 8.96536 46.6525 8.47376 46.6525 7.90023V5.2292C46.6525 4.65566 46.1609 4.16406 45.5874 4.16406C44.981 4.16406 44.5222 4.65566 44.5222 5.2292Z"
                        fill="#fff"
                      ></path>
                      <path
                        d="M46.6525 13.2585C46.6525 12.685 46.1609 12.1934 45.5874 12.1934H44.5222V13.2585C44.5222 13.832 45.0138 14.3236 45.5874 14.3236C46.1609 14.3236 46.6525 13.832 46.6525 13.2585Z"
                        fill="#fff"
                      ></path>
                      <path
                        d="M48.2584 9.52246H45.5874C45.0138 9.52246 44.5222 10.0141 44.5222 10.5876C44.5222 11.1611 45.0138 11.6527 45.5874 11.6527H48.2584C48.8319 11.6527 49.3235 11.1611 49.3235 10.5876C49.3235 9.98129 48.8319 9.52246 48.2584 9.52246Z"
                        fill="#fff"
                      ></path>
                    </g>
                    <rect
                      x="1"
                      y="34"
                      width="24"
                      height="25"
                      rx="2"
                      stroke="#fff"
                      stroke-width="2"
                    ></rect>
                    <g clip-path="url(#clip1_971_7928)">
                      <path
                        d="M17.6477 43.6591L16.2036 50.4186C16.0961 50.8949 15.8195 51.0024 15.4201 50.7873L13.254 49.1896L12.194 50.2036C12.0864 50.3111 11.9789 50.4186 11.7331 50.4186L11.9021 48.1911L15.9424 44.5194C16.1114 44.3504 15.8963 44.289 15.6813 44.4273L10.6577 47.5919L8.49161 46.9313C8.01537 46.7777 8.01537 46.4551 8.59915 46.24L17.0178 42.9678C17.4326 42.8449 17.7859 43.06 17.6477 43.6591Z"
                        fill="#fff"
                      ></path>
                    </g>
                    <path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      d="M31 10.5H26V8.5H31V10.5Z"
                      fill="#fff"
                    ></path>
                    <path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      d="M31 47H26V45H31V47Z"
                      fill="#fff"
                    ></path>
                    <path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      d="M14 28L14 33L12 33L12 28L14 28Z"
                      fill="#fff"
                    ></path>
                    <defs>
                      <clipPath id="clip0_971_7928">
                        <rect
                          width="10.4875"
                          height="10.4875"
                          fill="#0ea5e9"
                          transform="translate(39 4)"
                        ></rect>
                      </clipPath>
                      <clipPath id="clip1_971_7928">
                        <rect
                          width="9.83201"
                          height="9.83201"
                          fill="#0ea5e9"
                          transform="translate(8 42)"
                        ></rect>
                      </clipPath>
                    </defs>
                  </svg>
                </div>
                <h3 className="mt-md-4 fs-5 fw-semibold">
                  Structured Workflows
                </h3>
                <p className="mt-2 small">
                  Step-by-step workflow guidance to streamline tasks.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="col-12 col-sm-6 col-lg text-center">
              <div className="d-flex flex-column align-items-center">
                <div className="icon-box mb-2 mb-md-4">
                  <svg
                    width="100%"
                    height="auto"
                    viewBox="0 0 52 60"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      d="M13.2787 7.3766C12.4639 7.3766 11.8033 8.03716 11.8033 8.85201V15.2455H8.85248V8.85201C8.85248 6.40747 10.8342 4.42578 13.2787 4.42578H46.7213C49.1659 4.42578 51.1476 6.40747 51.1476 8.85201V51.1471C51.1476 53.5916 49.1659 55.5733 46.7213 55.5733H37.8689V52.6225H46.7213C47.5362 52.6225 48.1967 51.9619 48.1967 51.1471V8.85201C48.1967 8.03716 47.5362 7.3766 46.7213 7.3766H13.2787Z"
                      fill="#fff"
                    ></path>
                    <path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      d="M7.8689 22.6223C7.8689 22.079 8.30927 21.6387 8.8525 21.6387L30.4918 21.6387C31.0351 21.6387 31.4755 22.079 31.4755 22.6223C31.4755 23.1655 31.0351 23.6059 30.4918 23.6059L8.8525 23.6059C8.30927 23.6059 7.8689 23.1655 7.8689 22.6223Z"
                      fill="#fff"
                    ></path>
                    <path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      d="M7.8689 29.507C7.8689 28.9638 8.30927 28.5234 8.8525 28.5234L30.4918 28.5234C31.0351 28.5234 31.4755 28.9638 31.4755 29.507C31.4755 30.0503 31.0351 30.4907 30.4918 30.4907L8.8525 30.4907C8.30927 30.4907 7.8689 30.0503 7.8689 29.507Z"
                      fill="#fff"
                    ></path>
                    <path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      d="M7.8689 36.3928C7.8689 35.8496 8.30927 35.4092 8.8525 35.4092L30.4918 35.4092C31.0351 35.4092 31.4755 35.8496 31.4755 36.3928C31.4755 36.936 31.0351 37.3764 30.4918 37.3764L8.8525 37.3764C8.30927 37.3764 7.8689 36.936 7.8689 36.3928Z"
                      fill="#fff"
                    ></path>
                    <path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      d="M7.8689 43.2776C7.8689 42.7343 8.30927 42.2939 8.8525 42.2939L30.4918 42.2939C31.0351 42.2939 31.4755 42.7343 31.4755 43.2776C31.4755 43.8208 31.0351 44.2612 30.4918 44.2612L8.8525 44.2612C8.30927 44.2612 7.8689 43.8208 7.8689 43.2776Z"
                      fill="#fff"
                    ></path>
                    <path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      d="M15.7377 2.95082C15.7377 1.32113 17.0589 0 18.6886 0H23.6066C25.2363 0 26.5574 1.32113 26.5574 2.95082V5.74152C26.5574 6.28475 26.117 6.72512 25.5738 6.72512C25.0306 6.72512 24.5902 6.28475 24.5902 5.74152V2.95082C24.5902 2.40759 24.1498 1.96721 23.6066 1.96721H18.6886C18.1453 1.96721 17.7049 2.40759 17.7049 2.95082V24.5902C17.7049 25.1334 18.1453 25.5738 18.6886 25.5738H20.6558C21.199 25.5738 21.6394 25.1334 21.6394 24.5902V10.7016C21.6394 10.1584 22.0797 9.71803 22.623 9.71803C23.1662 9.71803 23.6066 10.1584 23.6066 10.7016V24.5902C23.6066 26.2199 22.2855 27.541 20.6558 27.541H18.6886C17.0589 27.541 15.7377 26.2199 15.7377 24.5902V2.95082Z"
                      fill="#fff"
                    ></path>
                    <path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      d="M36.3934 16.7213H2.95082V48.9L11.181 57.0492H36.3934V16.7213ZM2.95082 13.7705H36.3934C38.0231 13.7705 39.3443 15.0916 39.3443 16.7213V57.0492C39.3443 58.6789 38.0231 60 36.3934 60H11.181C10.4034 60 9.65727 59.6931 9.10474 59.146L0.874608 50.9968C0.314904 50.4426 0 49.6876 0 48.9V16.7213C0 15.0916 1.32113 13.7705 2.95082 13.7705Z"
                      fill="#fff"
                    ></path>
                    <path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      d="M10.3279 50.6558H1.96721V47.7049H10.8197C12.1777 47.7049 13.2787 48.8059 13.2787 50.1639V58.0328H10.3279V50.6558Z"
                      fill="#fff"
                    ></path>
                  </svg>
                </div>
                <h3 className="mt-md-4 fs-5 fw-semibold">Document Prep</h3>
                <p className="mt-2 small">
                  Organize and prepare documents effortlessly.
                </p>
              </div>
            </div>

            {/* Step 5 */}
            <div className="col-12 col-sm-6 col-lg text-center">
              <div className="d-flex flex-column align-items-center">
                <div className="icon-box mb-2 mb-md-4">
                  <svg
                    width="100%"
                    height="auto"
                    viewBox="0 0 67 60"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      d="M17.892 6.67578C17.892 6.1235 18.3397 5.67578 18.892 5.67578H24.226C26.4351 5.67578 28.226 7.46664 28.226 9.67578V32.789C28.226 33.3413 27.7783 33.789 27.226 33.789C26.6737 33.789 26.226 33.3413 26.226 32.789V9.67578C26.226 8.57121 25.3305 7.67578 24.226 7.67578H18.892C18.3397 7.67578 17.892 7.22807 17.892 6.67578Z"
                      fill="#fff"
                    ></path>
                    <path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      d="M37.8959 38.7891C37.8959 38.2368 38.3436 37.7891 38.8959 37.7891H49.7859C51.995 37.7891 53.7859 39.5799 53.7859 41.7891V50.5679C53.7859 51.1202 53.3382 51.5679 52.7859 51.5679C52.2336 51.5679 51.7859 51.1202 51.7859 50.5679V41.7891C51.7859 40.6845 50.8905 39.7891 49.7859 39.7891H38.8959C38.3436 39.7891 37.8959 39.3413 37.8959 38.7891Z"
                      fill="#fff"
                    ></path>
                    <rect
                      width="20.0016"
                      height="13.3344"
                      rx="2"
                      fill="#fff"
                    ></rect>
                    <rect
                      x="19"
                      y="33"
                      width="21"
                      height="11"
                      rx="2"
                      fill="#fff"
                    ></rect>
                    <rect
                      x="39.8958"
                      y="47.666"
                      width="24.6688"
                      height="11.3344"
                      rx="2"
                      fill="white"
                      stroke="#fff"
                      stroke-width="2"
                    ></rect>
                    <rect
                      x="21"
                      y="18"
                      width="45"
                      height="10"
                      rx="2"
                      fill="white"
                      stroke="#fff"
                      stroke-width="2"
                    ></rect>
                  </svg>
                </div>
                <h3 className="mt-4 fs-5 fw-semibold">Status Tracking</h3>
                <p className="mt-2 small">
                  Monitor progress and maintain accountability.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
   {/* FAQ */}
      <section className="faq-section">
        <div className="faq-bg-wrapper">
          <img src={FaqBg} className="faq-bg" alt="" />
        </div>

        <div className="faq-container">
          <div className="faq-header">
            <h1 className="faq-title">
              Frequently Asked <span className="text-gradient">Questions</span>
            </h1>
          </div>

          <div className="faq-content">
            <div className="faq-spacer" />

            <div className="faq-list">
              {[
                [
                  "Is Hidden Partner Cloud a financial institution or legal service provider?",
                  "No. We provide administrative infrastructure and workflow support only.",
                ],
                [
                  "Do you make decisions on behalf of third parties?",
                  "No. All decisions remain with external entities.",
                ],
                [
                  "Is this professional advice?",
                  "No. No legal, financial, or advisory services are provided.",
                ],
                [
                  "Does Hidden Partner Cloud guarantee results?",
                  "No. Outcomes depend on external entities and individual circumstances.",
                ],
              ].map(([q, a], i) => (
                <div className="faq-item" key={i}>
                  <div className="faq-icon">
                    {/* same SVG */}
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="white"
                    >
                      <path d="M17 9A5 5 0 0 0 7 9a1 1 0 0 0 2 0 3 3 0 1 1 3 3 1 1 0 0 0-1 1v2a1 1 0 0 0 2 0v-1.1A5 5 0 0 0 17 9z" />
                      <circle cx="12" cy="19" r="1" />
                    </svg>
                  </div>

                  <div className="faq-text">
                    <p className="faq-question">{q}</p>
                    <p className="faq-answer">{a}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
</section>
</>
  );
}