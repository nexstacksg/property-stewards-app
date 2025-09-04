"use client"

import React from 'react'
import PhoneInputBase from 'react-phone-input-2'
import 'react-phone-input-2/lib/style.css'

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
}

export function PhoneInput({ 
  value, 
  onChange, 
  placeholder = "Enter phone number",
  disabled = false,
  required = false 
}: PhoneInputProps) {
  // Handle the onChange to always include + prefix
  const handleChange = (phone: string) => {
    // The phone value from react-phone-input-2 doesn't include +
    // So we add it if it's not empty
    const formattedPhone = phone ? `+${phone}` : ''
    onChange(formattedPhone)
  }

  // Remove + from value when passing to component (it expects without +)
  const displayValue = value?.startsWith('+') ? value.substring(1) : value

  return (
    <div className="phone-input-wrapper">
      <PhoneInputBase
        country={'sg'}
        value={displayValue}
        onChange={handleChange}
        inputProps={{
          name: 'phone',
          required: required,
          disabled: disabled
        }}
        placeholder={placeholder}
        containerClass="!w-full"
        inputClass="!w-full !h-10 !text-sm !border !border-input !rounded-md !pl-14 focus:!outline-none disabled:!cursor-not-allowed disabled:!opacity-50"
        buttonClass="!border !border-input !border-r-0 !rounded-l-md !bg-background hover:!bg-accent"
        dropdownClass="!bg-popover !border !border-border !shadow-lg !rounded-lg !mt-1"
        enableSearch={false}
        disableSearchIcon={true}
        preferredCountries={['sg', 'my', 'id', 'ph', 'th', 'vn', 'in', 'jp', 'kr', 'au', 'gb', 'us']}
        countryCodeEditable={false}
      />
      <style jsx global>{`
        .phone-input-wrapper .react-tel-input {
          font-family: inherit;
        }
        
        .phone-input-wrapper .react-tel-input .flag-dropdown {
          background-color: hsl(var(--background));
          border-color: hsl(var(--border));
          padding: 0 8px;
        }
        
        .phone-input-wrapper .react-tel-input .selected-flag {
          background-color: hsl(var(--background));
          padding: 0;
        }
        
        .phone-input-wrapper .react-tel-input .selected-flag:hover,
        .phone-input-wrapper .react-tel-input .selected-flag:focus {
          background-color: hsl(var(--accent));
        }
        
        .phone-input-wrapper .react-tel-input .selected-flag .flag {
          margin-right: 6px;
        }
        
        .phone-input-wrapper .react-tel-input .selected-flag .arrow {
          border-top-color: hsl(var(--foreground));
          margin-left: 4px;
        }
        
        .phone-input-wrapper .react-tel-input .country-list {
          background-color: hsl(var(--popover));
          color: hsl(var(--popover-foreground));
          border-radius: 8px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
          border: 1px solid hsl(var(--border));
          margin-top: 4px;
          max-height: 300px;
          overflow-y: auto;
        }
        
        .phone-input-wrapper .react-tel-input .country-list .country {
          padding: 8px 12px;
          font-size: 14px;
          display: flex;
          align-items: center;
          transition: background-color 0.15s ease;
        }
        
        .phone-input-wrapper .react-tel-input .country-list .country .flag {
          margin-right: 10px;
        }
        
        .phone-input-wrapper .react-tel-input .country-list .country .country-name {
          margin-right: 5px;
          flex: 1;
        }
        
        .phone-input-wrapper .react-tel-input .country-list .country .dial-code {
          color: hsl(var(--muted-foreground));
          font-size: 13px;
        }
        
        .phone-input-wrapper .react-tel-input .country-list .country:hover {
          background-color: hsl(var(--accent));
        }
        
        .phone-input-wrapper .react-tel-input .country-list .country.highlight {
          background-color: hsl(var(--accent));
        }
        
        .phone-input-wrapper .react-tel-input .country-list .divider {
          border-bottom: 1px solid hsl(var(--border));
          margin: 4px 0;
        }
        
        .phone-input-wrapper .react-tel-input input {
          background-color: hsl(var(--background));
          color: hsl(var(--foreground));
        }
        
        .phone-input-wrapper .react-tel-input input::placeholder {
          color: hsl(var(--muted-foreground));
        }
        
        /* Hide search box completely */
        .phone-input-wrapper .react-tel-input .search {
          display: none !important;
        }
        
        .phone-input-wrapper .react-tel-input .search-box {
          display: none !important;
        }
        
        /* Scrollbar styling */
        .phone-input-wrapper .react-tel-input .country-list::-webkit-scrollbar {
          width: 6px;
        }
        
        .phone-input-wrapper .react-tel-input .country-list::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .phone-input-wrapper .react-tel-input .country-list::-webkit-scrollbar-thumb {
          background-color: hsl(var(--border));
          border-radius: 3px;
        }
        
        .phone-input-wrapper .react-tel-input .country-list::-webkit-scrollbar-thumb:hover {
          background-color: hsl(var(--muted-foreground));
        }
      `}</style>
    </div>
  )
}