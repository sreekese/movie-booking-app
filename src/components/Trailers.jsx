import { useState } from "react";
import ReactPlayer from "react-player";
import VideoTrailers from "../data/VideoTrailers";
import Blurcircle from "./Blurcircle";

const Trailers = () => {
  const [currentTrailer, setCurrentTrailer] = useState(VideoTrailers[0]);

  return (
    <div className="px-6 md:px-16 lg:px-24 xl:px-44 py-20 overflow-hidden">
      <p className="text-gray-300 font-medium text-lg max-w-[960px] mx-auto">
        Trailers
      </p>

      <div className="relative mt-6">
        <Blurcircle top="-100px" right="-100px" />

        <ReactPlayer
          url={currentTrailer.trailer}
          controls
          width="960px"
          height="540px"
          className="mx-auto max-w-full"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 mt-8 max-w-4xl mx-auto">
        {VideoTrailers.map((movie) => (
          <div
            key={movie.id}
            onClick={() => setCurrentTrailer(movie)}
            className = {`cursor-pointer rounded-lg overflow-hidden transition duration-300 hover:-translate-y-1 ${
              currentTrailer.id === movie.id
                ? "ring-4 ring-red-500"
                : ""
            }`}
          >
            <img
              src={movie.thumbnail}
              alt={movie.title}
              className="w-full h-40 object-cover brightness-75"
            />

            <p className="mt-2 text-center text-sm text-white">
              {movie.title}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Trailers;