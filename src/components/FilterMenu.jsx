import React, { useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import './FilterMenu.css';
import { useApp } from '../context/AppContext';

const FilterMenu = ({ isOpen, onClose, filters, onFilterChange, onApply, onReset, mapInstance }) => {
    const { distanceUnit } = useApp();
    const [localFilters, setLocalFilters] = useState(filters);

    // Sync local filters when global prop changes (e.g. from context)
    React.useEffect(() => {
        setLocalFilters(filters);
    }, [filters]);

    const handleChange = (field, value) => {
        const updated = { ...localFilters, [field]: value };
        setLocalFilters(updated);
        // We don't call onFilterChange instantly to allow user to tweak then "Apply"
    };

    const handleApply = () => {
        onFilterChange(localFilters);
        if (onApply) onApply(localFilters);
        onClose();
    };

    // Attach Autocomplete to location input
    React.useEffect(() => {
        if (!isOpen || !window.google?.maps?.places) return;

        const tid = setTimeout(() => {
            const input = document.getElementById('filter-location-input');
            if (input) {
                const options = {
                    types: ['(regions)']
                };

                const autocomplete = new window.google.maps.places.Autocomplete(input, options);

                if (mapInstance) {
                    autocomplete.bindTo('bounds', mapInstance);
                }

                autocomplete.addListener('place_changed', () => {
                    const place = autocomplete.getPlace();
                    if (place && place.formatted_address) {
                        handleChange('location', place.formatted_address);
                    }
                });
            }
        }, 100);
        return () => clearTimeout(tid);
    }, [isOpen, mapInstance]);

    const handleReset = () => {
        const defaultFilters = {
            location: '',
            radius: 10,
            unit: distanceUnit,
            type: '',
            date: null,
            keyword: ''
        };
        setLocalFilters(defaultFilters);
        onFilterChange(defaultFilters);
        if (onReset) onReset(defaultFilters);
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="filter-menu-overlay" onClick={onClose} />
            <div className={`filter-menu-panel ${isOpen ? 'open' : ''}`}>
                <div className="filter-menu-header">
                    <h2 className="filter-menu-title">SEARCH FILTERS</h2>
                    <button className="filter-menu-close" onClick={onClose}>✕</button>
                </div>

                <div className="filter-menu-content">
                    {/* 1. Location */}
                    <div className="filter-group">
                        <label>Location (City or Postal Code)</label>
                        <input
                            id="filter-location-input"
                            type="text"
                            className="filter-input"
                            placeholder="Enter location..."
                            value={localFilters.location}
                            onChange={(e) => handleChange('location', e.target.value)}
                        />
                    </div>

                    {/* 2. Distance */}
                    <div className="filter-group">
                        <label>Distance ({localFilters.unit})</label>
                        <div className="distance-control-row">
                            <input
                                type="range"
                                min="1"
                                max="100"
                                className="filter-range"
                                value={localFilters.radius}
                                onChange={(e) => handleChange('radius', parseInt(e.target.value))}
                            />
                            <span className="range-display">{localFilters.radius}</span>
                        </div>
                        <div className="unit-toggle">
                            <button
                                className={`unit-btn ${localFilters.unit === 'miles' ? 'active' : ''}`}
                                onClick={() => handleChange('unit', 'miles')}
                            >
                                MILES
                            </button>
                            <button
                                className={`unit-btn ${localFilters.unit === 'km' ? 'active' : ''}`}
                                onClick={() => handleChange('unit', 'km')}
                            >
                                KM
                            </button>
                        </div>
                    </div>

                    {/* 3. Pin Type */}
                    <div className="filter-group">
                        <label>Pin Type</label>
                        <select
                            className="filter-select"
                            value={localFilters.type}
                            onChange={(e) => handleChange('type', e.target.value)}
                        >
                            <option value="">All Types</option>
                            <option value="Woman for Man">Woman for Man</option>
                            <option value="Man for Woman">Man for Woman</option>
                            <option value="Woman for Woman">Woman for Woman</option>
                            <option value="Man for Man">Man for Man</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    {/* 4. Date */}
                    <div className="filter-group">
                        <label>Date</label>
                        <DatePicker
                            selected={localFilters.date}
                            onChange={(date) => handleChange('date', date)}
                            placeholderText="Select a date..."
                            className="filter-input"
                            isClearable
                        />
                    </div>

                    {/* 5. Keyword */}
                    <div className="filter-group">
                        <label>Keyword in Post</label>
                        <input
                            type="text"
                            className="filter-input"
                            placeholder="Search word..."
                            value={localFilters.keyword}
                            onChange={(e) => handleChange('keyword', e.target.value)}
                        />
                    </div>
                </div>

                <div className="filter-menu-footer">
                    <button className="filter-btn-reset" onClick={handleReset}>RESET ALL</button>
                    <button className="filter-btn-apply" onClick={handleApply}>FIND CONNECTIONS</button>
                </div>
            </div>
        </>
    );
};

export default FilterMenu;
