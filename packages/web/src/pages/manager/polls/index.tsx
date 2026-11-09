import PollEditor from "@razzia/web/features/poll/components/PollEditor"
import { createFileRoute } from "@tanstack/react-router"

const NewPollPage = () => <PollEditor />

export const Route = createFileRoute("/manager/polls/")({
  component: NewPollPage,
})
