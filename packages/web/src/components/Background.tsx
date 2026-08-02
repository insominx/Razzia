import logo from "@razzia/web/assets/logo.svg"
import Atmosphere from "@razzia/web/components/Atmosphere"
import GithubIcon from "@razzia/web/components/GithubIcon"
import type { PropsWithChildren } from "react"

const Background = ({ children }: PropsWithChildren) => (
  <section className="relative flex min-h-dvh flex-col items-center justify-center">
    <Atmosphere recipe="ambient" />

    <img src={logo} className="mb-10 h-16" alt="logo" />
    {children}

    <a
      href="https://github.com/Ralex91/Razzia"
      target="_blank"
      rel="noopener noreferrer"
      className="text-text-faint hover:text-text-muted ease-calm absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 text-sm font-semibold transition-colors"
    >
      <GithubIcon size={14} />
      {/* oxlint-disable-next-line no-undef */}
      Razzia - v{__APP_VERSION__}
    </a>
  </section>
)

export default Background
