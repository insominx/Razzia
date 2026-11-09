import { EVENTS } from "@razzia/common/constants"
import type { PollWithId } from "@razzia/common/types/poll"
import Loader from "@razzia/web/components/Loader"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import PollEditor from "@razzia/web/features/poll/components/PollEditor"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const EditPollPage = () => {
  const { pollId } = Route.useParams()
  const { socket } = useSocket()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [poll, setPoll] = useState<PollWithId | null>(null)

  useEffect(() => {
    socket.emit(EVENTS.POLLS.GET, pollId)
  }, [socket, pollId])

  useEvent(EVENTS.POLLS.DATA, ({ poll: data }) => {
    if (data.id === pollId) {
      setPoll(data)
    }
  })

  // A poll that is not there (a stale link, one deleted since) would leave the
  // loader spinning. Once a poll is open, the editor answers a failed save.
  // Replace, not push: Back must not return to the missing poll.
  useEvent(EVENTS.POLLS.ERROR, (message) => {
    if (poll) {
      return
    }

    toast.error(t(message))
    navigate({ to: "/manager/config", replace: true })
  })

  if (!poll) {
    return (
      <div className="bg-canvas flex h-svh items-center justify-center">
        <Loader className="text-brand max-h-23" />
      </div>
    )
  }

  return <PollEditor initial={poll} />
}

export const Route = createFileRoute("/manager/polls/$pollId")({
  component: EditPollPage,
})
