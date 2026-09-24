import { ToastBar, Toaster as ToasterRaw } from "react-hot-toast"

// Toasts float over every surface and both registers, so they take the
// neutral roles instead of the library's fixed white card.
const TOAST_STYLE = {
  background: "var(--rz-surface)",
  color: "var(--rz-text-primary)",
  border: "1px solid var(--rz-border)",
  borderRadius: "var(--rz-radius-md)",
}

const Toaster = () => (
  <ToasterRaw
    toastOptions={{
      style: TOAST_STYLE,
      success: {
        iconTheme: {
          primary: "var(--rz-success)",
          secondary: "var(--rz-surface)",
        },
      },
      error: {
        iconTheme: {
          primary: "var(--rz-danger)",
          secondary: "var(--rz-surface)",
        },
      },
    }}
  >
    {(t) => (
      <ToastBar
        toast={t}
        style={{
          ...t.style,
          fontWeight: 700,
        }}
      >
        {({ icon, message }) => (
          <>
            {icon}
            {message}
          </>
        )}
      </ToastBar>
    )}
  </ToasterRaw>
)

export default Toaster
