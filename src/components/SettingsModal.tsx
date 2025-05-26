import { useState } from "react";

interface SettingsModalProps {
    onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
    const [twapEnabled, setTwapEnabled] = useState<boolean>(false);
    const [twapIntervals, setTwapIntervals] = useState<number>(0);
    const [twapDelay, setTwapDelay] = useState<number>(0);

    const handleSave = () => {
        
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-4 rounded-lg w-11/12 max-w-md">
                <h2 className="text-xl font-bold mb-4">MEV Protection Settings</h2>
                <div className="mb-4">
                    <label className="flex items-center">
                        <input
                            type="checkbox"
                            checked={twapEnabled}
                            onChange={(e) => setTwapEnabled(e.target.checked)}
                            className="mr-2"
                        />
                        Enable TWAP
                    </label>
                </div>
                <div className="mb-4">
                    <label className="block text-sm mb-1">TWAP Intervals</label>
                    <input
                        type="number"
                        value={twapIntervals}
                        onChange={(e) => setTwapIntervals(parseInt(e.target.value))}
                        className="w-full p-2 bg-gray-700 rounded text-white"
                    />
                </div>
                <div className="mb-4">
                    <label className="block text-sm mb-1">TWAP Delay (ms)</label>
                    <input
                        type="number"
                        value={twapDelay}
                        onChange={(e) => setTwapDelay(parseInt(e.target.value))}
                        className="w-full p-2 bg-gray-700 rounded text-white"
                    />
                </div>
                <div className="flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 rounded-lg mr-2">
                        Cancel
                    </button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 rounded-lg">
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}