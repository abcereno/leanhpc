import img from '../../../assets/hpc.png';

export default function AppFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-dark text-white">
      <div className="container d-flex flex-column flex-md-row justify-content-between align-items-center text-center">
        <div className="d-flex align-items-center gap-2 mb-3 mb-md-0">
          <img src={img} alt="Logo" style={{ height: "60px", opacity: 0.9 }} />
          <small className="text-white-50">© {currentYear} Hidden Partner Cloud™. All rights reserved.</small>
        </div>
        <div>
          <a href="/terms-and-conditions" className="text-white-50 text-decoration-none me-3 small hover-white">Terms & Conditions</a>
          <span className="text-white-50 me-3">|</span>
          <a href="/privacy-policy" className="text-white-50 text-decoration-none me-3 small hover-white">Privacy Policy</a>
        </div>
      </div>
    </footer>
  );
}