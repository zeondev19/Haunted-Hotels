import type { Metadata } from "next";
import { Creepster, Nosifer, VT323 } from "next/font/google";
import "./globals.css";

const horrorTitle = Nosifer({
  weight: "400",
  variable: "--font-horror",
  subsets: ["latin"],
});

const creepFont = Creepster({
  weight: "400",
  variable: "--font-creep",
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
      className={`${horrorTitle.variable} ${creepFont.variable} ${pixelBody.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-[#070304] text-neutral-100">{children}</body>
    </html>
  );
}
