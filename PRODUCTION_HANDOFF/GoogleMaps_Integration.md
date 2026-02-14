# Google Maps & Places API Integration Guide

This guide explains how to replace the mock location search with the actual **Google Places Autocomplete** for production.

### 1. Requirements
- A Google Cloud Project with **Places API** and **Maps JavaScript API** enabled.
- A valid API Key.

### 2. Implementation logic

#### Step A: Load the Google Maps Script
Add this to your `main.html` or `index.html` (Meteor project):
```html
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&libraries=places"></script>
```

#### Step B: Use Google Places Autocomplete in React
In your `Account.jsx` or `MapView.jsx`, use the `useRef` hook to attach the autocomplete to the input field.

```jsx
import React, { useEffect, useRef } from 'react';

const LocationInput = ({ onLocationSelected }) => {
  const inputRef = useRef(null);

  useEffect(() => {
    // Initialize Google Places Autocomplete
    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['establishment', 'geocode'],
      componentRestrictions: { country: 'us' } // Optional: restrict to USA
    });

    // Listen for place selection
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      
      if (!place.geometry) {
        console.error("No details available for input: '" + place.name + "'");
        return;
      }

      // Extract details for the pin
      const locationData = {
        name: place.name || place.formatted_address,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        address: place.formatted_address
      };

      onLocationSelected(locationData);
    });
  }, []);

  return (
    <input 
      ref={inputRef}
      type="text" 
      placeholder="Enter address or business name (e.g. Coyote Joe's)" 
      className="post-input"
    />
  );
};
```

### 3. Meteor Method Update
When saving the pin, make sure to store the **Place ID** or the **Formatted Name** so you can display it in the "Messages" or "Browse" list.

```javascript
// In server/methods.js
'pins.insert'(pinData) {
  // pinData now includes the business name from Google
  Pins.insert({
    ...pinData,
    createdAt: new Date(),
    ownerId: this.userId
  });
}
```
