import { Calendar1Icon, Clock1Icon } from "lucide-react";


const HeroSection = () => {
  return (
    <div
      className="relative h-screen bg-cover bg-center"
      style={{
        backgroundImage:
          'url("https://i.cdn.newsbytesapp.com/images/l70420220408162006.jpeg")',
      }}
    >
      <div className="absolute inset-0 bg-black/60"></div>

      <div className="relative z-10 flex h-full items-center px-6 md:px-16 lg:px-32">
        <div className="max-w-2xl text-white">
            <img src='https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSThEr4aD4Lk7yAFg86Jf-3rTtLZ9TQcImJmg&s' alt='marvel-logo' className='max-h-11 lg:h-11 mt-20'/>
          <h1 className="text-5xl font-bold leading-tight md:text-7xl">
            Marvel Movies
            <br />
            Avengers
          </h1>
          <div className="flex items-center gap-4 text-gray-300">
            <span>Action | Adventure | Sc-fi</span>
            <div className="flex items-center gap-1">
                <Calendar1Icon className="w-4.5 h-4.5"/> 2026
            </div>
            <div className="flex items-center gap-1">
                <Clock1Icon className="w-4.5 h-4.5"/> 2h 36m
            </div>
          </div>

          <p className="mt-6 text-lg text-gray-200">
            Earth's mightiest heroes unite to protect the world from powerful
            enemies. Experience action, adventure, and epic battles.
          </p>

          <div className="mt-8 flex gap-4">
            <button className="rounded bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-700">
              ▶ Watch Now
            </button>

          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroSection;