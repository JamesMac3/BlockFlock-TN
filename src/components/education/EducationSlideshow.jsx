import { useState } from "react";

import basicFlock from "../../assets/edu_basicflockoperation.png";
import dataFusion from "../../assets/edu_Datafusion.png";
import howDataIsCollected from "../../assets/edu_howdataiscollected.png";
import oversight from "../../assets/edu_oversight.png";
import signalTrace from "../../assets/edu_signaltrace.png";
import tools from "../../assets/edu_tools.png";

import "./EducationSlideshow.css";

const educationSlides = [
  {
    id: 1,
    title: "Basic Flock Operation",
    subtitle: "An overview of how the Flock Safety ecosystem operates.",
    image: basicFlock,
  },
  {
    id: 2,
    title: "Data Fusion",
    subtitle:
      "Understanding how surveillance systems combine multiple data sources.",
    image: dataFusion,
  },
  {
    id: 3,
    title: "How Data Is Collected",
    subtitle:
      "The methods and technologies used to gather surveillance data.",
    image: howDataIsCollected,
  },
  {
    id: 4,
    title: "Oversight",
    subtitle:
      "Governance, auditing, and accountability of surveillance systems.",
    image: oversight,
  },
  {
    id: 5,
    title: "Signal Trace",
    subtitle:
      "How wireless identifiers and device information can be analyzed.",
    image: signalTrace,
  },
  {
    id: 6,
    title: "Tools",
    subtitle:
      "The software and hardware used throughout the surveillance ecosystem.",
    image: tools,
  },
];

export default function EducationSlideshow() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slide = educationSlides[currentSlide];

  function showPreviousSlide() {
    setCurrentSlide((current) =>
      current === 0 ? educationSlides.length - 1 : current - 1
    );
  }

  function showNextSlide() {
    setCurrentSlide((current) =>
      current === educationSlides.length - 1 ? 0 : current + 1
    );
  }

return (
  <section
    className="education-slideshow"
    aria-label="Educational infographic slideshow"
  >
    <div className="education-slide-frame">
      <img
        src={slide.image}
        alt={slide.title}
        className="education-slideshow-image"
      />

      <button
        type="button"
        className="education-slide-arrow education-slide-arrow-left"
        onClick={showPreviousSlide}
        aria-label="Previous slide"
      >
        ‹
      </button>

      <button
        type="button"
        className="education-slide-arrow education-slide-arrow-right"
        onClick={showNextSlide}
        aria-label="Next slide"
      >
        ›
      </button>
    </div>

    <div className="education-slide-details">
      <div className="education-slide-dots">
        {educationSlides.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={
              index === currentSlide
                ? "education-slide-dot active"
                : "education-slide-dot"
            }
            onClick={() => setCurrentSlide(index)}
            aria-label={`Show slide ${index + 1}: ${item.title}`}
            aria-current={index === currentSlide ? "true" : undefined}
          />
        ))}
      </div>

      <div className="education-slide-caption">
        <h2>{slide.title}</h2>
        <p>{slide.subtitle}</p>
      </div>
    </div>
  </section>
);
}