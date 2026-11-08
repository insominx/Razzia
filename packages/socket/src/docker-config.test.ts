import { readFileSync } from "fs"
import { describe, expect, it } from "vitest"

const read = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8")

describe("container configuration", () => {
  it("runs the socket server unprivileged and keeps it restarting", () => {
    const supervisord = read("docker/supervisord.conf")
    const socket = supervisord.split("[program:socket]")[1] ?? ""

    expect(socket).toMatch(/^user=node$/m)
    expect(socket).toMatch(/^startretries=\d{4,}$/m)
  })

  it("has a healthcheck and hands config to the unprivileged user", () => {
    expect(read("Dockerfile")).toMatch(/^HEALTHCHECK /m)
    expect(read("docker/entrypoint.sh")).toMatch(
      /chown .*node:node \/app\/config/,
    )
  })

  it("sets security headers in every location that sets its own headers", () => {
    const nginx = read("docker/nginx.conf")
    const withCache = nginx.match(/add_header Cache-Control/g)?.length ?? 0

    expect(nginx).toMatch(/server_tokens off/)
    expect(nginx.match(/security-headers\.conf/g)?.length).toBe(withCache + 1)
    expect(read("docker/security-headers.conf")).toMatch(/nosniff/)
  })

  it("keeps secrets out of the docker build context", () => {
    const ignore = read(".dockerignore")

    expect(ignore).toMatch(/^\.env$/m)
    expect(ignore).toMatch(/^razzia-workflow$/m)
  })
})
