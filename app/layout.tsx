import type { Metadata } from "next";
import { Press_Start_2P, VT323 } from "next/font/google";
import "./globals.css";

const pixelHeading = Press_Start_2P({
  weight: "400",
  variable: "--font-pixel",
  subsets: ["latin"],
});

const pixelBody = VT323({
  weight: "400",
  variable: "--font-vt",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Going Up? - Room 1008",
  description: "2-Player Cooperative Pixel Horror Elevator Survival Game",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${pixelHeading.variable} ${pixelBody.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-[#070304] text-neutral-100">{children}</body>
    </html>
  );
}
