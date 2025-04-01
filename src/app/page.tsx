"use client";
import React from "react";
import { WavyBackground } from "@/components/ui/wavy-background";

export default function WavyBackgroundDemo() {
  return (
    <WavyBackground className="w-[100vw] mx-auto pb-40">
      <img
        src="https://camo.githubusercontent.com/74cbc79070c04e7077cfd86981c110678fe434e9269ea8f52eafb37b781cfb4a/68747470733a2f2f646f63732e6b65706c6f792e696f2f696d672f6b65706c6f792d6c6f676f2d6461726b2e7376673f733d32303026763d34"
        alt="Keploy Logo"
        className="mx-auto w-40 mb-8"
      />
      <p className="text-2xl md:text-4xl lg:text-7xl text-white font-bold inter-var text-center">
        Keploy - Simplify Your API Testing
      </p>
      <p className="text-base md:text-lg mt-4 text-white font-normal inter-var text-center">
        Automate performance and functional testing for your APIs with ease
      </p>
      <button
        onClick={() => window.location.href = '/dashboard'}
        className="relative inline-flex items-center justify-center px-8 py-2.5 overflow-hidden tracking-tighter text-white bg-gray-800 rounded-md group mx-auto ml-[45%] mt-8"
      >
        <span className="absolute w-0 h-0 transition-all duration-500 ease-out bg-orange-600 rounded-full group-hover:w-56 group-hover:h-56"></span>
        <span className="absolute bottom-0 left-0 h-full -ml-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-auto h-full opacity-100 object-stretch"
            viewBox="0 0 487 487"
          >
            <path
              fillOpacity=".1"
              fillRule="nonzero"
              fill="#FFF"
              d="M0 .3c67 2.1 134.1 4.3 186.3 37 52.2 32.7 89.6 95.8 112.8 150.6 23.2 54.8 32.3 101.4 61.2 149.9 28.9 48.4 77.7 98.8 126.4 149.2H0V.3z"
            />
          </svg>
        </span>
        <span className="absolute top-0 right-0 w-12 h-full -mr-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="object-cover w-full h-full"
            viewBox="0 0 487 487"
          >
            <path
              fillOpacity=".1"
              fillRule="nonzero"
              fill="#FFF"
              d="M487 486.7c-66.1-3.6-132.3-7.3-186.3-37s-95.9-85.3-126.2-137.2c-30.4-51.8-49.3-99.9-76.5-151.4C70.9 109.6 35.6 54.8.3 0H487v486.7z"
            />
          </svg>
        </span>
        <span className="absolute inset-0 w-full h-full -mt-1 rounded-lg opacity-30 bg-gradient-to-b from-transparent via-transparent to-gray-200"></span>
        <span className="relative text-base font-semibold">
          <span className="mr-2">🚀</span>Go To Dashboard
        </span>
      </button>
    </WavyBackground>
  );
}
