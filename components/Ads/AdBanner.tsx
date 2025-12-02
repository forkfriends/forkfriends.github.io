import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';

type Props = {
  adUnitId?: string;
  variant?: 'banner' | 'square' | 'vertical';
};

export default function AdBanner({ variant = 'banner' }: Props) {
  return <WebAdSenseBanner variant={variant} />;
}

function WebAdSenseBanner({ variant }: { variant: 'banner' | 'square' | 'vertical' }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const clientId = process.env.EXPO_PUBLIC_ADSENSE_CLIENT_ID;
  const slotId = process.env.EXPO_PUBLIC_ADSENSE_SLOT_ID;
  const forcePlaceholder = process.env.EXPO_PUBLIC_AD_PLACEHOLDER === '1';

  // Show dev placeholder if no AdSense credentials configured or explicitly disabled
  if (!clientId || !slotId || forcePlaceholder) {
    return (
      <View style={{ alignItems: 'center' }}>
        <DevPlaceholder
          variant={variant}
          reason={
            forcePlaceholder
              ? 'Ads disabled via EXPO_PUBLIC_AD_PLACEHOLDER'
              : 'Set EXPO_PUBLIC_ADSENSE_CLIENT_ID and EXPO_PUBLIC_ADSENSE_SLOT_ID'
          }
        />
      </View>
    );
  }

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let cancelled = false;
    const fallbackTimer = setTimeout(() => {
      if (status === 'loading') {
        setStatus('error');
      }
    }, 8000);

    const ensureScript = () =>
      new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(
          'script[src^="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]'
        );
        if (existing) {
          if (existing.getAttribute('data-loaded') === 'true') {
            resolve();
            return;
          }
          existing.addEventListener('load', () => resolve());
          existing.addEventListener('error', (e) => reject(e));
          return;
        }

        const script = document.createElement('script');
        script.async = true;
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
        script.crossOrigin = 'anonymous';
        script.onload = () => {
          script.setAttribute('data-loaded', 'true');
          resolve();
        };
        script.onerror = (e) => reject(e);
        document.head.appendChild(script);
      });

    ensureScript()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = '';
        const ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.display = 'block';
        const dims = getDims(variant);
        ins.style.width = dims.width;
        ins.style.height = dims.height;
        ins.setAttribute('data-ad-client', clientId);
        ins.setAttribute('data-ad-slot', slotId);
        ins.setAttribute('data-ad-format', 'auto');
        ins.setAttribute('data-full-width-responsive', 'true');
        containerRef.current.appendChild(ins);
        try {
          // @ts-expect-error adsbygoogle injected by script
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          setStatus('ready');
        } catch (err) {
          console.warn('[AdBanner][web] Failed to render ad', err);
          setStatus('error');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[AdBanner][web] Failed to load AdSense script', err);
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
    };
  }, [clientId, slotId, variant]);

  const dims = getDims(variant);

  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: dims.containerWidth as any,
          maxWidth: dims.maxWidth as any,
          minHeight: dims.minHeight,
          backgroundColor: status === 'ready' ? 'transparent' : '#f8fafc',
          borderWidth: status === 'ready' ? 0 : 1,
          borderColor: '#e5e7eb',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
        {status === 'loading' && (
          <Text style={{ fontSize: 12, color: '#6b7280', padding: 8 }}>Loading ad…</Text>
        )}
        {status === 'error' && <DevPlaceholder variant={variant} reason="Ad failed to load" />}
        <div
          ref={containerRef}
          style={{
            width: '100%',
            minHeight: status === 'ready' ? dims.minHeight : 0,
            display: status === 'ready' ? 'flex' : 'none',
            justifyContent: 'center',
          }}
        />
      </View>
    </View>
  );
}

function DevPlaceholder({ variant, reason }: { variant: string; reason: string }) {
  const dims = getDims(variant as 'banner' | 'square' | 'vertical');
  return (
    <View
      style={{
        height: dims.minHeight,
        width: 320,
        maxWidth: '100%',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#fef3c7',
        borderColor: '#f59e0b',
        borderWidth: 1,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#92400e', marginBottom: 4 }}>
        Ad Placeholder (Web)
      </Text>
      <Text style={{ fontSize: 10, color: '#a16207', textAlign: 'center' }}>{reason}</Text>
    </View>
  );
}

function getDims(variant: 'banner' | 'square' | 'vertical') {
  switch (variant) {
    case 'square':
      return {
        width: '250px',
        height: '250px',
        containerWidth: '100%',
        maxWidth: 320,
        minHeight: 250,
      };
    case 'vertical':
      return {
        width: '120px',
        height: '600px',
        containerWidth: '100%',
        maxWidth: 160,
        minHeight: 600,
      };
    default:
      return {
        width: '100%',
        height: '90px',
        containerWidth: '100%',
        maxWidth: '100%',
        minHeight: 90,
      };
  }
}
