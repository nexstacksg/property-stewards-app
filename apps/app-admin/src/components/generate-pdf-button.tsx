"use client"

import { useState } from "react"
import { FileDown, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"

interface GeneratePdfButtonProps {
  href: string
  fileName: string
  label?: string
}

export function GeneratePdfButton({ href, fileName, label = "Generate PDF" }: GeneratePdfButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleGenerate = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(href, {
        cache: "no-store"
      })

      if (!response.ok) {
        throw new Error(`Failed to generate PDF (${response.status})`)
      }

      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = blobUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error("Failed to generate PDF", error)
      alert("Unable to generate PDF. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button onClick={handleGenerate} variant="outline" disabled={isLoading} type="button">
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <FileDown className="mr-2 h-4 w-4" />
          {label}
        </>
      )}
    </Button>
  )
}
