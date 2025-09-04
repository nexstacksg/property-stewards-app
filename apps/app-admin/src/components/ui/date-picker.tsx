"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface DatePickerProps {
  value?: Date | string
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  disabled = false,
  required = false
}: DatePickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(() => {
    if (value) {
      const d = new Date(value)
      d.setHours(12, 0, 0, 0) // Normalize to noon to avoid timezone issues
      return d
    }
    return undefined
  })
  const [currentMonth, setCurrentMonth] = React.useState<Date>(() => {
    if (value) {
      const d = new Date(value)
      d.setHours(12, 0, 0, 0)
      return d
    }
    const now = new Date()
    now.setHours(12, 0, 0, 0)
    return now
  })
  const [isOpen, setIsOpen] = React.useState(false)

  React.useEffect(() => {
    if (value) {
      const newDate = new Date(value)
      newDate.setHours(12, 0, 0, 0) // Normalize to noon
      setDate(newDate)
      setCurrentMonth(newDate)
    }
  }, [value])

  const handleSelect = (selectedDate: Date) => {
    // Set to Singapore timezone (UTC+8) at noon to avoid date shifting
    const sgDate = new Date(selectedDate)
    sgDate.setHours(12, 0, 0, 0) // Set to noon Singapore time
    
    setDate(sgDate)
    if (onChange) {
      onChange(sgDate)
    }
    setIsOpen(false)
  }

  const handleMonthChange = (month: string) => {
    const newDate = new Date(currentMonth)
    newDate.setMonth(parseInt(month))
    setCurrentMonth(newDate)
  }

  const handleYearChange = (year: string) => {
    const newDate = new Date(currentMonth)
    newDate.setFullYear(parseInt(year))
    setCurrentMonth(newDate)
  }

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentMonth)
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1)
    } else {
      newDate.setMonth(newDate.getMonth() + 1)
    }
    setCurrentMonth(newDate)
  }

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]

  const years = Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - 50 + i)

  // Get days in month
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days = []
    
    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }
    
    // Add all days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      const day = new Date(year, month, i)
      day.setHours(12, 0, 0, 0) // Set to noon to avoid timezone issues
      days.push(day)
    }

    return days
  }

  const days = getDaysInMonth(currentMonth)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const isToday = (day: Date | null) => {
    if (!day) return false
    return day.toDateString() === today.toDateString()
  }

  const isSelected = (day: Date | null) => {
    if (!day || !date) return false
    return day.toDateString() === date.toDateString()
  }

  // Remove the future date check - allow all dates to be selected
  const isFutureDate = (day: Date | null) => {
    return false // Allow selecting any date
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-10",
            !date && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "dd/MM/yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-4">
          {/* Month and Year Selection */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-1 hover:bg-accent rounded-md transition-colors"
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            
            <div className="flex gap-2">
              <Select
                value={currentMonth.getMonth().toString()}
                onValueChange={handleMonthChange}
              >
                <SelectTrigger className="h-8 w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month, index) => (
                    <SelectItem key={month} value={index.toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select
                value={currentMonth.getFullYear().toString()}
                onValueChange={handleYearChange}
              >
                <SelectTrigger className="h-8 w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <button
              onClick={() => navigateMonth('next')}
              className="p-1 hover:bg-accent rounded-md transition-colors"
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="space-y-2">
            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                <div key={day} className="text-xs text-muted-foreground font-medium py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* Date Grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => (
                <div key={index} className="aspect-square">
                  {day ? (
                    <button
                      onClick={() => !isFutureDate(day) && handleSelect(day)}
                      disabled={isFutureDate(day)}
                      className={cn(
                        "h-full w-full rounded-md text-sm transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        "focus:outline-none",
                        isToday(day) && !isSelected(day) && "bg-accent/50 font-medium",
                        isSelected(day) && "border-2 border-foreground font-semibold hover:bg-accent/50",
                        isFutureDate(day) && "text-muted-foreground/50 cursor-not-allowed hover:bg-transparent"
                      )}
                      type="button"
                    >
                      {day.getDate()}
                    </button>
                  ) : (
                    <div className="h-full w-full" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Today Link */}
          <div className="mt-4 pt-3 border-t text-center">
            <button
              onClick={() => {
                const todaySG = new Date()
                todaySG.setHours(12, 0, 0, 0) // Set to noon Singapore time
                setDate(todaySG)
                setCurrentMonth(todaySG)
                if (onChange) {
                  onChange(todaySG)
                }
                setIsOpen(false)
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              type="button"
            >
              Today
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}