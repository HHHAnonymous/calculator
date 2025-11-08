import React, { useState, useEffect } from 'react';
import { Calculator, Clock, Calendar, DollarSign, Plus, Trash2, Download, Upload, Copy } from 'lucide-react';

const OTCalculator = () => {
  const [entries, setEntries] = useState([]);
  const [currentEntry, setCurrentEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    clockIn: '',
    clockOut: '',
    isPublicHoliday: false,
    publicHolidayOption: 'pay'
  });
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState('');
  const [scriptCopied, setScriptCopied] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timerClockIn, setTimerClockIn] = useState('');

  useEffect(() => {
    loadEntries();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadEntries = async () => {
    try {
      const result = await window.storage.get('ot-entries');
      if (result && result.value) {
        setEntries(JSON.parse(result.value));
      }
    } catch (error) {
      console.log('No saved entries found');
    }
  };

  const saveEntries = async (newEntries) => {
    try {
      await window.storage.set('ot-entries', JSON.stringify(newEntries));
    } catch (error) {
      console.error('Error saving entries:', error);
    }
  };

  const calculateMinClockOut = (clockIn) => {
    if (!clockIn) return '';
    const [hour, min] = clockIn.split(':').map(Number);
    const totalMinutes = hour * 60 + min + 510;
    const outHour = Math.floor(totalMinutes / 60) % 24;
    const outMin = totalMinutes % 60;
    return `${String(outHour).padStart(2, '0')}:${String(outMin).padStart(2, '0')}`;
  };

  const calculateOTStartTime = (clockIn) => {
    if (!clockIn) return '';
    const [hour, min] = clockIn.split(':').map(Number);
    const totalMinutes = hour * 60 + min + 510 + 30;
    const outHour = Math.floor(totalMinutes / 60) % 24;
    const outMin = totalMinutes % 60;
    return `${String(outHour).padStart(2, '0')}:${String(outMin).padStart(2, '0')}`;
  };

  const isWeekendOrHoliday = () => {
    const dayOfWeek = new Date(currentEntry.date).getDay();
    return dayOfWeek === 0 || dayOfWeek === 6 || currentEntry.isPublicHoliday;
  };

  const calculateOT = (entry) => {
    const { date, clockIn, clockOut, isPublicHoliday, publicHolidayOption } = entry;
    
    if (!clockIn || !clockOut) return null;

    const dayOfWeek = new Date(date).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    const [inHour, inMin] = clockIn.split(':').map(Number);
    const [outHour, outMin] = clockOut.split(':').map(Number);
    
    const clockInMinutes = inHour * 60 + inMin;
    const clockOutMinutes = outHour * 60 + outMin;
    
    let totalMinutes = clockOutMinutes - clockInMinutes;
    if (totalMinutes < 0) totalMinutes += 24 * 60;

    const totalHours = totalMinutes / 60;

    if (isWeekend || isPublicHoliday) {
      const otHours = Math.floor(totalMinutes / 60);
      const otMinutes = totalMinutes % 60;
      const roundedOTHours = otMinutes > 0 ? otHours + (otMinutes / 60) : otHours;
      
      const hourlyRate = 20;
      const mealAllowance = totalHours >= 4 ? 13 : 0;
      const otPay = roundedOTHours * hourlyRate;
      
      if (isPublicHoliday && publicHolidayOption === 'leave') {
        const leaveHours = Math.min(8, roundedOTHours);
        const excessHours = Math.max(0, roundedOTHours - 8);
        return {
          type: 'Public Holiday (Leave)',
          hours: roundedOTHours,
          leaveHours: leaveHours,
          excessPay: excessHours * 20,
          mealAllowance: mealAllowance,
          totalPay: (excessHours * 20) + mealAllowance,
          breakdown: `${leaveHours.toFixed(2)} hours leave`
        };
      }
      
      return {
        type: isPublicHoliday ? 'Public Holiday' : 'Weekend',
        hours: roundedOTHours,
        mealAllowance: mealAllowance,
        otPay: otPay,
        totalPay: otPay + mealAllowance,
        breakdown: `${roundedOTHours.toFixed(2)}h × RM${hourlyRate}`
      };
    }

    const standardWorkMinutes = 8.5 * 60;
    
    if (totalMinutes <= standardWorkMinutes) {
      return {
        type: 'No OT',
        hours: 0,
        totalPay: 0,
        breakdown: 'Less than 8.5 hours'
      };
    }

    const breakMinutes = 30;
    const otStartMinutes = standardWorkMinutes + breakMinutes;
    
    if (totalMinutes <= otStartMinutes) {
      return {
        type: 'No OT',
        hours: 0,
        totalPay: 0,
        breakdown: 'Less than 9 hours'
      };
    }

    const actualOTMinutes = totalMinutes - otStartMinutes;
    
    // MINIMUM 1 HOUR RULE: If less than 60 minutes, no OT can be claimed
    if (actualOTMinutes < 60) {
      return {
        type: 'No OT',
        hours: 0,
        totalPay: 0,
        breakdown: 'Less than 1 hour OT (minimum required)'
      };
    }
    
    // Calculate exact OT hours in decimal (e.g., 1.5 hours, 2.3 hours)
    const exactOTHours = actualOTMinutes / 60;
    
    const mealAllowance = 13; // Always RM13 since minimum is 1 hour
    const otPay = exactOTHours * 13;
    
    return {
      type: 'Weekday',
      hours: exactOTHours,
      mealAllowance: mealAllowance,
      otPay: otPay,
      totalPay: otPay + mealAllowance,
      breakdown: `${exactOTHours.toFixed(2)}h × RM13 + RM13 meal`
    };
  };

  const addEntry = () => {
    const result = calculateOT(currentEntry);
    if (!result) return;

    const newEntry = {
      ...currentEntry,
      id: Date.now(),
      result
    };

    const newEntries = [...entries, newEntry];
    setEntries(newEntries);
    saveEntries(newEntries);

    setCurrentEntry({
      date: new Date().toISOString().split('T')[0],
      clockIn: '',
      clockOut: '',
      isPublicHoliday: false,
      publicHolidayOption: 'pay'
    });
  };

  const deleteEntry = (id) => {
    const newEntries = entries.filter(e => e.id !== id);
    setEntries(newEntries);
    saveEntries(newEntries);
  };

  const clearAllEntries = async () => {
    const confirmed = window.confirm(`Clear all ${entries.length} entries?\n\nThis cannot be undone!`);
    
    if (confirmed) {
      setEntries([]);
      try {
        await window.storage.delete('ot-entries');
        alert('All entries cleared.');
      } catch (error) {
        console.error('Error clearing entries:', error);
      }
    }
  };

  const importAttendanceData = () => {
    try {
      const data = JSON.parse(importData);
      const newEntries = [];
      const duplicates = [];
      
      data.forEach(item => {
        if (item.date && item.clockIn && item.clockOut) {
          const existingEntry = entries.find(e => e.date === item.date);
          
          if (existingEntry) {
            duplicates.push(item.date);
            return;
          }
          
          const entry = {
            date: item.date,
            clockIn: item.clockIn,
            clockOut: item.clockOut,
            isPublicHoliday: item.isPublicHoliday || false,
            publicHolidayOption: 'pay',
            id: Date.now() + Math.random()
          };
          
          const result = calculateOT(entry);
          if (result) {
            newEntries.push({ ...entry, result });
          }
        }
      });

      if (newEntries.length > 0) {
        const combined = [...entries, ...newEntries];
        setEntries(combined);
        saveEntries(combined);
        setShowImportModal(false);
        setImportData('');
        
        let message = `Imported ${newEntries.length} entries!`;
        if (duplicates.length > 0) {
          message += `\n\nSkipped ${duplicates.length} duplicates`;
        }
        alert(message);
      } else if (duplicates.length > 0) {
        alert(`All ${duplicates.length} entries already exist.`);
      } else {
        alert('No valid entries found.');
      }
    } catch (error) {
      alert('Invalid data format.');
      console.error(error);
    }
  };

  const copyScriptToClipboard = () => {
    const script = `(function() {
  console.log('🚀 Starting extraction...');
  const monthSelector = document.querySelector('.month-select span[data-v-04959c39]');
  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth() + 1;
  if (monthSelector) {
    const match = monthSelector.textContent.trim().match(/(\\d{4})\\.(\\d{1,2})/);
    if (match) { currentYear = parseInt(match[1]); currentMonth = parseInt(match[2]); }
  }
  const allDayCells = document.querySelectorAll('.van-calendar__day');
  const daysWithAttendance = [];
  allDayCells.forEach(cell => {
    if (cell.querySelector('.van-calendar__bottom-info span[data-v-04959c39]')) daysWithAttendance.push(cell);
  });
  console.log('Found ' + daysWithAttendance.length + ' days');
  const results = [];
  function extractTimes() {
    return new Promise((resolve) => {
      setTimeout(() => {
        const times = [];
        document.querySelectorAll('.right-content span[data-v-04959c39]').forEach(span => {
          if (/^\\d{1,2}:\\d{2}$/.test(span.textContent.trim())) times.push(span.textContent.trim());
        });
        resolve(times);
      }, 600);
    });
  }
  async function process() {
    for (const cell of daysWithAttendance) {
      const dayMatch = cell.textContent.trim().match(/^\\d{1,2}/);
      if (!dayMatch) continue;
      const day = parseInt(dayMatch[0]);
      cell.click();
      const times = await extractTimes();
      if (times.length >= 2) {
        results.push({
          date: currentYear+'-'+String(currentMonth).padStart(2,'0')+'-'+String(day).padStart(2,'0'),
          clockIn: times[0],
          clockOut: times[times.length-1],
          isPublicHoliday: false
        });
      }
      await new Promise(r => setTimeout(r, 400));
    }
    console.log('Done! '+results.length+' records');
    console.log(JSON.stringify(results, null, 2));
    navigator.clipboard.writeText(JSON.stringify(results, null, 2))
      .then(() => alert('✅ '+results.length+' records copied!'))
      .catch(() => alert('Copy from console'));
  }
  if (daysWithAttendance.length > 0) process();
  else alert('No attendance days found');
})();`;

    navigator.clipboard.writeText(script)
      .then(() => {
        setScriptCopied(true);
        setTimeout(() => setScriptCopied(false), 3000);
      })
      .catch(() => alert('Could not copy script'));
  };

  const getMonthlyTotal = () => {
    // Payslip period: 29th of LAST month to 28th of CURRENT/SELECTED month
    const [year, month] = selectedMonth.split('-').map(Number);
    
    // Start date: 29th of LAST month (month - 1)
    let startYear = year;
    let startMonth = month - 1;
    if (startMonth === 0) {
      startMonth = 12;
      startYear = year - 1;
    }
    const startDateStr = `${startYear}-${String(startMonth).padStart(2, '0')}-29`;
    
    // End date: 28th of SELECTED month (THIS month)
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-28`;
    
    const filtered = entries.filter(e => e.date >= startDateStr && e.date <= endDateStr);
    const totalPay = filtered.reduce((sum, e) => sum + (e.result?.totalPay || 0), 0);
    const totalHours = filtered.reduce((sum, e) => sum + (e.result?.hours || 0), 0);
    const cappedPay = Math.min(totalPay, 1200);
    
    return { totalPay, cappedPay, totalHours, count: filtered.length, startDate: startDateStr, endDate: endDateStr };
  };

  const monthlyTotal = getMonthlyTotal();
  const currentResult = calculateOT(currentEntry);

  const exportData = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 2, 29).toISOString().split('T')[0];
    const endDate = new Date(year, month - 1, 28).toISOString().split('T')[0];
    
    const filtered = entries.filter(e => e.date >= startDate && e.date <= endDate);
    const csv = [
      ['Date','Day','Clock In','Clock Out','Type','Hours','Pay'].join(','),
      ...filtered.map(e => [
        e.date,
        new Date(e.date).toLocaleDateString('en-US', { weekday: 'short' }),
        e.clockIn,
        e.clockOut,
        e.result.type,
        e.result.hours.toFixed(2),
        e.result.totalPay
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Payslip-Period-${selectedMonth}.csv`;
    a.click();
  };

  const calculateCountdown = () => {
    if (!timerClockIn) return null;

    const [hour, min] = timerClockIn.split(':').map(Number);
    const clockInTime = new Date();
    clockInTime.setHours(hour, min, 0, 0);

    const finishTime = new Date(clockInTime);
    finishTime.setMinutes(finishTime.getMinutes() + 510); // 8.5 hours = 510 minutes

    const now = currentTime;
    const diff = finishTime - now;

    if (diff < 0) {
      const overtimeMs = Math.abs(diff);
      const overtimeHours = Math.floor(overtimeMs / (1000 * 60 * 60));
      const overtimeMinutes = Math.floor((overtimeMs % (1000 * 60 * 60)) / (1000 * 60));
      const overtimeSeconds = Math.floor((overtimeMs % (1000 * 60)) / 1000);
      return {
        isOvertime: true,
        hours: overtimeHours,
        minutes: overtimeMinutes,
        seconds: overtimeSeconds,
        finishTime: finishTime
      };
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return {
      isOvertime: false,
      hours,
      minutes,
      seconds,
      finishTime
    };
  };

  const countdown = calculateCountdown();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-3xl shadow-[8px_8px_16px_#bebebe,-8px_-8px_16px_#ffffff] p-8 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl shadow-[inset_2px_2px_5px_rgba(0,0,0,0.2),inset_-2px_-2px_5px_rgba(255,255,255,0.7)] flex items-center justify-center">
                <Calculator className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-800">Calculator</h1>
                <p className="text-gray-500 text-sm mt-1">Track overtime and calculate pay</p>
              </div>
            </div>
            <button
              onClick={() => setShowImportModal(true)}
              className="px-6 py-3 bg-gray-200 rounded-2xl shadow-[5px_5px_10px_#bebebe,-5px_-5px_10px_#ffffff] hover:shadow-[inset_5px_5px_10px_#bebebe,inset_-5px_-5px_10px_#ffffff] active:shadow-[inset_5px_5px_10px_#bebebe,inset_-5px_-5px_10px_#ffffff] transition-all duration-200 flex items-center gap-2 font-semibold text-gray-700"
            >
              <Upload className="w-4 h-4" />
              Import Data
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Timer Widget */}
          <div className="bg-white rounded-3xl shadow-[8px_8px_16px_#bebebe,-8px_-8px_16px_#ffffff] p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-5 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-500" />
              Work Timer
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Your Clock In Time</label>
                <input
                  type="time"
                  value={timerClockIn}
                  onChange={(e) => setTimerClockIn(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-100 rounded-2xl shadow-[inset_3px_3px_6px_#bebebe,inset_-3px_-3px_6px_#ffffff] focus:outline-none text-gray-800 text-lg font-bold"
                />
              </div>

              {countdown && (
                <div className="p-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-3xl shadow-[inset_3px_3px_8px_rgba(0,0,0,0.1)]">
                  <p className="text-sm font-semibold text-gray-600 mb-2">
                    {countdown.isOvertime ? 'Working Overtime!' : 'Time Until Finish (8.5h)'}
                  </p>
                  
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <div className="text-center">
                      <div className={`text-4xl font-bold ${countdown.isOvertime ? 'text-red-600' : 'text-indigo-600'}`}>
                        {String(countdown.hours).padStart(2, '0')}
                      </div>
                      <div className="text-xs text-gray-500 font-semibold mt-1">Hours</div>
                    </div>
                    <div className={`text-3xl font-bold ${countdown.isOvertime ? 'text-red-600' : 'text-indigo-600'}`}>:</div>
                    <div className="text-center">
                      <div className={`text-4xl font-bold ${countdown.isOvertime ? 'text-red-600' : 'text-indigo-600'}`}>
                        {String(countdown.minutes).padStart(2, '0')}
                      </div>
                      <div className="text-xs text-gray-500 font-semibold mt-1">Minutes</div>
                    </div>
                    <div className={`text-3xl font-bold ${countdown.isOvertime ? 'text-red-600' : 'text-indigo-600'}`}>:</div>
                    <div className="text-center">
                      <div className={`text-4xl font-bold ${countdown.isOvertime ? 'text-red-600' : 'text-indigo-600'}`}>
                        {String(countdown.seconds).padStart(2, '0')}
                      </div>
                      <div className="text-xs text-gray-500 font-semibold mt-1">Seconds</div>
                    </div>
                  </div>

                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">
                      {countdown.isOvertime ? 'Started at' : 'Finish at'}
                    </p>
                    <p className="text-2xl font-bold text-gray-800">
                      {countdown.finishTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </p>
                  </div>

                  {countdown.isOvertime && (
                    <div className="mt-4 p-3 bg-red-50 rounded-xl border-2 border-red-200">
                      <p className="text-sm font-bold text-red-700 text-center">
                        🎉 You're earning OT! Remember the 30-min break rule.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {!timerClockIn && (
                <div className="p-8 text-center text-gray-400">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm font-semibold">Enter your clock in time to start the countdown</p>
                </div>
              )}
            </div>
          </div>

          {/* Input Section */}
          <div className="bg-white rounded-3xl shadow-[8px_8px_16px_#bebebe,-8px_-8px_16px_#ffffff] p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-5 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              New Entry
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={currentEntry.date}
                  onChange={(e) => setCurrentEntry({...currentEntry, date: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-100 rounded-2xl shadow-[inset_3px_3px_6px_#bebebe,inset_-3px_-3px_6px_#ffffff] focus:outline-none text-gray-800"
                />
                <p className="text-xs text-gray-500 mt-2">
                  {new Date(currentEntry.date).toLocaleDateString('en-US', { weekday: 'long' })}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Clock In</label>
                  <input
                    type="time"
                    value={currentEntry.clockIn}
                    onChange={(e) => setCurrentEntry({...currentEntry, clockIn: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-100 rounded-2xl shadow-[inset_3px_3px_6px_#bebebe,inset_-3px_-3px_6px_#ffffff] focus:outline-none text-gray-800"
                  />
                  {currentEntry.clockIn && (
                    <div className="mt-3 p-3 bg-gray-100 rounded-2xl shadow-[inset_2px_2px_4px_#bebebe,inset_-2px_-2px_4px_#ffffff] text-xs space-y-1">
                      <p className="text-gray-700"><span className="font-bold">Min:</span> {calculateMinClockOut(currentEntry.clockIn)}</p>
                      {!isWeekendOrHoliday() && (
                        <p className="text-blue-600"><span className="font-bold">OT:</span> {calculateOTStartTime(currentEntry.clockIn)}</p>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Clock Out</label>
                  <input
                    type="time"
                    value={currentEntry.clockOut}
                    onChange={(e) => setCurrentEntry({...currentEntry, clockOut: e.target.value})}
                    min={currentEntry.clockIn ? calculateMinClockOut(currentEntry.clockIn) : ''}
                    className="w-full px-4 py-3 bg-gray-100 rounded-2xl shadow-[inset_3px_3px_6px_#bebebe,inset_-3px_-3px_6px_#ffffff] focus:outline-none text-gray-800"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-100 rounded-2xl shadow-[inset_2px_2px_4px_#bebebe,inset_-2px_-2px_4px_#ffffff]">
                <input
                  type="checkbox"
                  checked={currentEntry.isPublicHoliday}
                  onChange={(e) => setCurrentEntry({...currentEntry, isPublicHoliday: e.target.checked})}
                  className="w-5 h-5 accent-blue-500"
                />
                <span className="text-sm font-semibold text-gray-700">Public Holiday</span>
              </label>

              {currentEntry.isPublicHoliday && (
                <div className="pl-6 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer p-2">
                    <input
                      type="radio"
                      value="pay"
                      checked={currentEntry.publicHolidayOption === 'pay'}
                      onChange={(e) => setCurrentEntry({...currentEntry, publicHolidayOption: e.target.value})}
                      className="w-4 h-4 accent-blue-500"
                    />
                    <span className="text-sm text-gray-700">RM20/hour pay</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer p-2">
                    <input
                      type="radio"
                      value="leave"
                      checked={currentEntry.publicHolidayOption === 'leave'}
                      onChange={(e) => setCurrentEntry({...currentEntry, publicHolidayOption: e.target.value})}
                      className="w-4 h-4 accent-blue-500"
                    />
                    <span className="text-sm text-gray-700">Replacement leave</span>
                  </label>
                </div>
              )}

              {currentResult && (
                <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-[inset_3px_3px_6px_rgba(0,0,0,0.1)]">
                  <h3 className="font-bold text-gray-800 mb-2 text-sm">Preview</h3>
                  <p className="text-sm text-gray-600 mb-1">{currentResult.type}</p>
                  <p className="text-base font-semibold text-gray-800 mb-2">
                    {currentResult.leaveHours ? `${currentResult.leaveHours.toFixed(1)}h leave` : `${currentResult.hours.toFixed(1)}h`}
                  </p>
                  <p className="text-2xl font-bold text-blue-600">
                    RM{currentResult.totalPay.toFixed(2)}
                  </p>
                </div>
              )}

              <button
                onClick={addEntry}
                disabled={!currentEntry.clockIn || !currentEntry.clockOut}
                className="w-full py-3 bg-gradient-to-br from-blue-400 to-blue-600 text-white rounded-2xl shadow-[5px_5px_10px_#bebebe,-5px_-5px_10px_#ffffff] hover:shadow-[inset_5px_5px_10px_rgba(0,0,0,0.2)] active:shadow-[inset_5px_5px_10px_rgba(0,0,0,0.2)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 font-bold"
              >
                <Plus className="w-5 h-5" />
                Add Entry
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-white rounded-3xl shadow-[8px_8px_16px_#bebebe,-8px_-8px_16px_#ffffff] p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-500" />
                Payslip Summary
              </h2>
              <div className="text-right">
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-4 py-2 bg-gray-100 rounded-2xl shadow-[inset_2px_2px_4px_#bebebe,inset_-2px_-2px_4px_#ffffff] text-sm text-gray-800 focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Period: {monthlyTotal.startDate} to {monthlyTotal.endDate}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="p-4 bg-gray-100 rounded-2xl shadow-[inset_3px_3px_6px_#bebebe,inset_-3px_-3px_6px_#ffffff]">
                <p className="text-xs text-gray-500 font-semibold mb-1">Hours</p>
                <p className="text-2xl font-bold text-gray-800">{monthlyTotal.totalHours.toFixed(1)}</p>
              </div>
              <div className="p-4 bg-gray-100 rounded-2xl shadow-[inset_3px_3px_6px_#bebebe,inset_-3px_-3px_6px_#ffffff]">
                <p className="text-xs text-gray-500 font-semibold mb-1">Entries</p>
                <p className="text-2xl font-bold text-gray-800">{monthlyTotal.count}</p>
              </div>
              <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl shadow-[inset_3px_3px_6px_rgba(0,0,0,0.1)]">
                <p className="text-xs text-gray-600 font-semibold mb-1">Total Pay</p>
                <p className="text-2xl font-bold text-green-600">RM{monthlyTotal.totalPay.toFixed(2)}</p>
              </div>
              <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl shadow-[inset_3px_3px_6px_rgba(0,0,0,0.1)]">
                <p className="text-xs text-gray-600 font-semibold mb-1">Capped</p>
                <p className="text-2xl font-bold text-green-600">RM{monthlyTotal.cappedPay.toFixed(2)}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={exportData}
                disabled={monthlyTotal.count === 0}
                className="flex-1 py-2.5 bg-gray-200 rounded-2xl shadow-[5px_5px_10px_#bebebe,-5px_-5px_10px_#ffffff] hover:shadow-[inset_5px_5px_10px_#bebebe,inset_-5px_-5px_10px_#ffffff] active:shadow-[inset_5px_5px_10px_#bebebe,inset_-5px_-5px_10px_#ffffff] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 font-semibold text-gray-700 text-sm"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              <button
                onClick={clearAllEntries}
                disabled={entries.length === 0}
                className="flex-1 py-2.5 bg-gray-200 rounded-2xl shadow-[5px_5px_10px_#bebebe,-5px_-5px_10px_#ffffff] hover:shadow-[inset_5px_5px_10px_#bebebe,inset_-5px_-5px_10px_#ffffff] active:shadow-[inset_5px_5px_10px_#bebebe,inset_-5px_-5px_10px_#ffffff] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 font-semibold text-gray-700 text-sm"
              >
                <Trash2 className="w-4 h-4" />
                Clear ({entries.length})
              </button>
            </div>
          </div>
        </div>

        {/* Entries Table */}
        <div className="bg-white rounded-3xl shadow-[8px_8px_16px_#bebebe,-8px_-8px_16px_#ffffff] p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-500" />
            Payslip Period: {monthlyTotal.startDate} to {monthlyTotal.endDate}
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-xs font-bold text-gray-600 uppercase">Date</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-gray-600 uppercase">Time</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-gray-600 uppercase">Type</th>
                  <th className="text-right py-3 px-4 text-xs font-bold text-gray-600 uppercase">Hours</th>
                  <th className="text-right py-3 px-4 text-xs font-bold text-gray-600 uppercase">Pay</th>
                  <th className="text-center py-3 px-4 text-xs font-bold text-gray-600 uppercase">Action</th>
                </tr>
              </thead>
              <tbody>
                {entries
                  .filter(e => e.date >= monthlyTotal.startDate && e.date <= monthlyTotal.endDate)
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map(entry => (
                    <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm text-gray-800 font-semibold">
                        {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {entry.clockIn} - {entry.clockOut}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <span className={`px-3 py-1 rounded-xl text-xs font-semibold ${
                          entry.result.type.includes('Public') || entry.result.type.includes('Weekend') 
                            ? 'bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 shadow-[inset_1px_1px_2px_rgba(0,0,0,0.1)]' 
                            : 'bg-gray-200 text-gray-700 shadow-[inset_1px_1px_2px_rgba(0,0,0,0.1)]'
                        }`}>
                          {entry.result.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-gray-800 font-semibold">
                        {entry.result.leaveHours ? `${entry.result.leaveHours.toFixed(1)}h leave` : `${entry.result.hours.toFixed(1)}h`}
                      </td>
                      <td className="py-3 px-4 text-sm text-right font-bold text-green-600">
                        RM{entry.result.totalPay.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => deleteEntry(entry.id)}
                          className="p-2 bg-gray-200 rounded-xl shadow-[3px_3px_6px_#bebebe,-3px_-3px_6px_#ffffff] hover:shadow-[inset_3px_3px_6px_#bebebe,inset_-3px_-3px_6px_#ffffff] active:shadow-[inset_3px_3px_6px_#bebebe,inset_-3px_-3px_6px_#ffffff] transition-all duration-200"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {entries.filter(e => e.date >= monthlyTotal.startDate && e.date <= monthlyTotal.endDate).length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No entries for this payslip period
              </div>
            )}
          </div>
        </div>

        {/* Import Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black bg-opacity-40 z-50 overflow-y-auto">
            <div className="min-h-screen flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-[10px_10px_30px_rgba(0,0,0,0.3)] max-w-3xl w-full my-8">
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-3xl z-10">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-gray-800">Import Data</h2>
                    <button
                      onClick={() => { setShowImportModal(false); setImportData(''); }}
                      className="w-10 h-10 bg-gray-200 rounded-full shadow-[3px_3px_6px_#bebebe,-3px_-3px_6px_#ffffff] hover:shadow-[inset_3px_3px_6px_#bebebe,inset_-3px_-3px_6px_#ffffff] flex items-center justify-center text-gray-600 font-bold text-xl transition-all"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="p-6 max-h-[calc(90vh-80px)] overflow-y-auto space-y-4">
                  <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-[inset_2px_2px_5px_rgba(0,0,0,0.1)]">
                    <h3 className="font-bold text-gray-800 mb-3 text-sm">How to Import:</h3>
                    <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
                      <li>Click "Copy Script" below</li>
                      <li>Go to Attendance Records page</li>
                      <li>Press <kbd className="px-2 py-1 bg-white rounded-lg shadow-inner text-xs font-mono">F12</kbd></li>
                      <li>Paste and press <kbd className="px-2 py-1 bg-white rounded-lg shadow-inner text-xs font-mono">Enter</kbd></li>
                      <li>Wait for extraction</li>
                      <li>Paste data below</li>
                    </ol>
                  </div>

                  <button
                    onClick={copyScriptToClipboard}
                    className="w-full py-3 bg-gradient-to-br from-blue-400 to-blue-600 text-white rounded-2xl shadow-[5px_5px_10px_rgba(0,0,0,0.2)] hover:shadow-[inset_5px_5px_10px_rgba(0,0,0,0.2)] transition-all duration-200 flex items-center justify-center gap-2 font-bold relative"
                  >
                    <Copy className="w-5 h-5" />
                    {scriptCopied ? '✓ Copied!' : 'Copy Script'}
                    {scriptCopied && (
                      <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-3 py-1 rounded-full shadow-lg">
                        ✓
                      </span>
                    )}
                  </button>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Paste Data:</label>
                    <textarea
                      value={importData}
                      onChange={(e) => setImportData(e.target.value)}
                      placeholder='[{"date":"2025-10-16","clockIn":"08:40","clockOut":"19:09","isPublicHoliday":false}]'
                      className="w-full h-64 px-4 py-3 bg-gray-100 rounded-2xl shadow-[inset_3px_3px_6px_#bebebe,inset_-3px_-3px_6px_#ffffff] focus:outline-none font-mono text-xs text-gray-800 resize-none"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={importAttendanceData}
                      disabled={!importData.trim()}
                      className="flex-1 py-3 bg-gradient-to-br from-green-400 to-green-600 text-white rounded-2xl shadow-[5px_5px_10px_rgba(0,0,0,0.2)] hover:shadow-[inset_5px_5px_10px_rgba(0,0,0,0.2)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-bold"
                    >
                      Import
                    </button>
                    <button
                      onClick={() => { setShowImportModal(false); setImportData(''); }}
                      className="flex-1 py-3 bg-gray-200 rounded-2xl shadow-[5px_5px_10px_#bebebe,-5px_-5px_10px_#ffffff] hover:shadow-[inset_5px_5px_10px_#bebebe,inset_-5px_-5px_10px_#ffffff] transition-all duration-200 font-bold text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="p-4 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-2xl shadow-[inset_2px_2px_5px_rgba(0,0,0,0.1)]">
                    <h3 className="font-bold text-amber-900 mb-2 text-sm">Manual Format:</h3>
                    <pre className="bg-white p-3 rounded-xl text-xs overflow-x-auto shadow-inner text-gray-800">
{`[
  {
    "date": "2025-10-16",
    "clockIn": "08:40",
    "clockOut": "19:09",
    "isPublicHoliday": false
  }
]`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OTCalculator;