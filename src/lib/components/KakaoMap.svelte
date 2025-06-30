<script>
	import { onMount, onDestroy } from 'svelte';
	import { PUBLIC_KAKAO_MAP_API_KEY } from '$env/static/public';

	/** @type {Array<{id: string, name: string, location_lat?: number, location_lng?: number, is_creator: boolean}>} */
	export let participants = [];
	/** @type {{lat: number, lng: number, name?: string, address?: string} | null} */
	export let destination = null;
	/** @type {boolean} */
	export let isCreator = false;
	
	/** @type {HTMLDivElement} */
	let mapContainer;
	/** @type {any} */
	let map;
	/** @type {Array<any>} */
	let markers = [];
	/** @type {any} */
	let destinationMarker = null;
	/** @type {any} */
	let tempMarker = null;
	let longPressTimer = null;
	let isLongPress = false;

	// Kakao Maps API 로드
	function loadKakaoMapsAPI() {
		return new Promise((resolve, reject) => {
			// @ts-ignore
			if (window.kakao && window.kakao.maps) {
				// @ts-ignore
				resolve(window.kakao.maps);
				return;
			}

			const script = document.createElement('script');
			script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${PUBLIC_KAKAO_MAP_API_KEY}&autoload=false&libraries=services`;
			script.onload = () => {
				// @ts-ignore
				window.kakao.maps.load(() => {
					// @ts-ignore
					resolve(window.kakao.maps);
				});
			};
			script.onerror = reject;
			document.head.appendChild(script);
		});
	}

	// 지도 초기화
	async function initMap() {
		try {
			const kakaoMaps = await loadKakaoMapsAPI();
			
			// 서울 중심으로 초기화
			const container = mapContainer;
			const options = {
				center: new kakaoMaps.LatLng(37.5665, 126.9780),
				level: 8
			};

			map = new kakaoMaps.Map(container, options);
			
			// 지도 클릭 이벤트 추가
			setupMapEvents();
			
			updateMarkers();
		} catch (error) {
			console.error('카카오맵 로드 실패:', error);
		}
	}

	// 지도 이벤트 설정
	function setupMapEvents() {
		// @ts-ignore
		if (!map || !window.kakao?.maps) return;

		// 지도 클릭 이벤트
		// @ts-ignore
		window.kakao.maps.event.addListener(map, 'click', function(mouseEvent) {
			if (isLongPress) {
				isLongPress = false;
				return;
			}
			
			// @ts-ignore
			const latlng = mouseEvent.latLng;
			const lat = latlng.getLat();
			const lng = latlng.getLng();
			
			setDestinationAtLocation(lat, lng);
		});

		// 지도 마우스 다운 이벤트 (롱 프레스 시작)
		// @ts-ignore
		window.kakao.maps.event.addListener(map, 'mousedown', function(mouseEvent) {
			isLongPress = false;
			longPressTimer = setTimeout(() => {
				isLongPress = true;
				// @ts-ignore
				const latlng = mouseEvent.latLng;
				const lat = latlng.getLat();
				const lng = latlng.getLng();
				
				setDestinationAtLocation(lat, lng);
			}, 800); // 800ms 롱 프레스
		});

		// 지도 마우스 업 이벤트 (롱 프레스 취소)
		// @ts-ignore
		window.kakao.maps.event.addListener(map, 'mouseup', function() {
			if (longPressTimer) {
				clearTimeout(longPressTimer);
				longPressTimer = null;
			}
		});

		// 터치 이벤트 처리 (모바일)
		if (mapContainer) {
			mapContainer.addEventListener('touchstart', function(e) {
				isLongPress = false;
				longPressTimer = setTimeout(() => {
					isLongPress = true;
					const touch = e.touches[0];
					const rect = mapContainer.getBoundingClientRect();
					const x = touch.clientX - rect.left;
					const y = touch.clientY - rect.top;
					
					// 화면 좌표를 지도 좌표로 변환
					// @ts-ignore
					const projection = map.getProjection();
					// @ts-ignore
					const coord = projection.coordFromContainerPoint(new window.kakao.maps.Point(x, y));
					const lat = coord.getLat();
					const lng = coord.getLng();
					
					setDestinationAtLocation(lat, lng);
				}, 800);
			});

			mapContainer.addEventListener('touchend', function() {
				if (longPressTimer) {
					clearTimeout(longPressTimer);
					longPressTimer = null;
				}
			});

			mapContainer.addEventListener('touchmove', function() {
				if (longPressTimer) {
					clearTimeout(longPressTimer);
					longPressTimer = null;
				}
			});
		}
	}

	// 특정 위치에 목적지 설정
	function setDestinationAtLocation(lat, lng) {
		console.log('=== KakaoMap: 목적지 설정 요청 ===');
		console.log('위치:', { lat, lng });
		console.log('isCreator:', isCreator);
		
		// 방장이 아닌 경우 목적지 설정 불가
		if (!isCreator) {
			console.log('방장이 아니므로 목적지 설정 요청 무시');
			// 방장이 아닌 사용자에게 간단한 안내 (선택사항)
			// alert('목적지 설정은 방장만 가능합니다.');
			return;
		}
		
		// 부모 컴포넌트에 목적지 설정 이벤트 전달
		if (typeof window !== 'undefined') {
			const eventDetail = {
				lat: lat,
				lng: lng,
				name: '선택한 위치',
				address: `위도: ${lat.toFixed(6)}, 경도: ${lng.toFixed(6)}`
			};
			console.log('방장 권한 확인됨 - 이벤트 detail:', eventDetail);
			console.log('setDestinationFromMap 이벤트 발생');
			
			window.dispatchEvent(new CustomEvent('setDestinationFromMap', {
				detail: eventDetail
			}));
			
			console.log('setDestinationFromMap 이벤트 전송 완료');
		} else {
			console.error('window 객체가 없습니다');
		}
	}

	// 지도를 특정 위치로 이동
	function moveMapToLocation(detail) {
		// @ts-ignore
		if (!map || !window.kakao?.maps) return;
		
		console.log('지도 이동:', detail);
		
		// @ts-ignore
		const moveLatLng = new window.kakao.maps.LatLng(detail.lat, detail.lng);
		map.setCenter(moveLatLng);
		map.setLevel(3); // 확대
		
		// 임시 마커 표시 (선택 가능한 위치 표시)
		showTempMarker(detail.lat, detail.lng, detail.name);
	}

	// 임시 마커 표시
	function showTempMarker(lat, lng, name) {
		// @ts-ignore
		if (!map || !window.kakao?.maps) return;
		
		// 기존 임시 마커 제거
		if (tempMarker) {
			tempMarker.setMap(null);
		}
		
		// @ts-ignore
		const position = new window.kakao.maps.LatLng(lat, lng);
		
		// 임시 마커 HTML 생성 (점선 스타일)
		const tempMarkerContent = `
			<div style="position: relative; text-align: center;">
				<div style="
					background: #f59e0b;
					color: white;
					padding: 4px 8px;
					border-radius: 12px;
					font-size: 12px;
					font-weight: 600;
					white-space: nowrap;
					box-shadow: 0 2px 4px rgba(0,0,0,0.2);
					margin-bottom: 5px;
					max-width: 200px;
					overflow: hidden;
					text-overflow: ellipsis;
					border: 2px dashed #fbbf24;
					animation: pulse 2s infinite;
				">
					📍 ${name || '선택한 위치'}
				</div>
				<div style="
					width: 20px;
					height: 20px;
					background: #f59e0b;
					border: 3px dashed #fbbf24;
					border-radius: 50%;
					margin: 0 auto;
					box-shadow: 0 2px 4px rgba(0,0,0,0.3);
					animation: pulse 2s infinite;
				"></div>
				<div style="
					position: absolute;
					top: 100%;
					left: 50%;
					transform: translateX(-50%);
					width: 0;
					height: 0;
					border-left: 6px solid transparent;
					border-right: 6px solid transparent;
					border-top: 8px solid #f59e0b;
					margin-top: -8px;
				"></div>
			</div>
			<style>
				@keyframes pulse {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.7; }
				}
			</style>
		`;

		// 임시 마커 생성
		// @ts-ignore
		tempMarker = new window.kakao.maps.CustomOverlay({
			position: position,
			content: tempMarkerContent,
			yAnchor: 1,
			map: map
		});
	}

	// 임시 마커 제거
	function cancelTempMarker() {
		if (tempMarker) {
			tempMarker.setMap(null);
			tempMarker = null;
		}
	}

	// 마커 업데이트
	function updateMarkers() {
		// @ts-ignore
		if (!map || !window.kakao?.maps) return;

		// 기존 마커 제거
		markers.forEach(marker => marker.setMap(null));
		markers = [];

		// 참여자 마커 추가
		participants.forEach(participant => {
			if (participant.location_lat && participant.location_lng) {
				// @ts-ignore
				const position = new window.kakao.maps.LatLng(
					participant.location_lat, 
					participant.location_lng
				);

				// 커스텀 마커 HTML 생성
				const markerContent = `
					<div style="position: relative; text-align: center;">
						<div style="
							background: ${participant.is_creator ? '#ef4444' : '#3b82f6'};
							color: white;
							padding: 4px 8px;
							border-radius: 12px;
							font-size: 12px;
							font-weight: 600;
							white-space: nowrap;
							box-shadow: 0 2px 4px rgba(0,0,0,0.2);
							margin-bottom: 5px;
						">
							${participant.name}${participant.is_creator ? ' 👑' : ''}
						</div>
						<div style="
							width: 20px;
							height: 20px;
							background: ${participant.is_creator ? '#ef4444' : '#3b82f6'};
							border: 3px solid white;
							border-radius: 50%;
							margin: 0 auto;
							box-shadow: 0 2px 4px rgba(0,0,0,0.3);
						"></div>
						<div style="
							position: absolute;
							top: 100%;
							left: 50%;
							transform: translateX(-50%);
							width: 0;
							height: 0;
							border-left: 6px solid transparent;
							border-right: 6px solid transparent;
							border-top: 8px solid ${participant.is_creator ? '#ef4444' : '#3b82f6'};
							margin-top: -8px;
						"></div>
					</div>
				`;

				// 커스텀 오버레이 생성
				// @ts-ignore
				const customOverlay = new window.kakao.maps.CustomOverlay({
					position: position,
					content: markerContent,
					yAnchor: 1,
					map: map
				});

				markers.push(customOverlay);
			}
		});

		// 목적지 설정 시 임시 마커 제거
		if (destination && tempMarker) {
			tempMarker.setMap(null);
			tempMarker = null;
		}

		// 목적지 마커 추가
		if (destination) {
			if (destinationMarker) {
				destinationMarker.setMap(null);
			}

			// @ts-ignore
			const position = new window.kakao.maps.LatLng(destination.lat, destination.lng);
			
			// 목적지 커스텀 마커 HTML 생성
			const destinationName = destination.name || '목적지';
			const destinationContent = `
				<div style="position: relative; text-align: center;">
					<div style="
						background: #059669;
						color: white;
						padding: 4px 8px;
						border-radius: 12px;
						font-size: 12px;
						font-weight: 600;
						white-space: nowrap;
						box-shadow: 0 2px 4px rgba(0,0,0,0.2);
						margin-bottom: 5px;
						max-width: 200px;
						overflow: hidden;
						text-overflow: ellipsis;
					">
						🎯 ${destinationName}
					</div>
					<div style="
						width: 24px;
						height: 24px;
						background: #059669;
						border: 3px solid white;
						border-radius: 50%;
						margin: 0 auto;
						box-shadow: 0 2px 4px rgba(0,0,0,0.3);
						display: flex;
						align-items: center;
						justify-content: center;
						font-size: 12px;
					">
						🎯
					</div>
					<div style="
						position: absolute;
						top: 100%;
						left: 50%;
						transform: translateX(-50%);
						width: 0;
						height: 0;
						border-left: 6px solid transparent;
						border-right: 6px solid transparent;
						border-top: 8px solid #059669;
						margin-top: -8px;
					"></div>
				</div>
			`;

			// 목적지 커스텀 오버레이 생성
			// @ts-ignore
			destinationMarker = new window.kakao.maps.CustomOverlay({
				position: position,
				content: destinationContent,
				yAnchor: 1,
				map: map
			});
		}

		// 모든 마커가 보이도록 지도 범위 조정
		if (markers.length > 0 || destinationMarker) {
			// @ts-ignore
			const bounds = new window.kakao.maps.LatLngBounds();
			let hasLocations = false;
			
			// 참여자 위치 추가
			participants.forEach(participant => {
				if (participant.location_lat && participant.location_lng) {
					// @ts-ignore
					bounds.extend(new window.kakao.maps.LatLng(participant.location_lat, participant.location_lng));
					hasLocations = true;
				}
			});
			
			// 목적지 위치 추가
			if (destination) {
				// @ts-ignore
				bounds.extend(new window.kakao.maps.LatLng(destination.lat, destination.lng));
				hasLocations = true;
				
				// 목적지만 있고 참여자 위치가 없으면 목적지 중심으로 확대
				if (markers.length === 0) {
					// @ts-ignore
					map.setCenter(new window.kakao.maps.LatLng(destination.lat, destination.lng));
					map.setLevel(3); // 적당한 확대 레벨
					return;
				}
			}
			
			// 범위에 여백 추가하여 설정
			if (hasLocations && !bounds.isEmpty()) {
				map.setBounds(bounds, 50, 50, 50, 50);
			}
		}
	}

	onMount(() => {
		initMap();
		
		// 지도 이벤트 리스너 추가
		if (typeof window !== 'undefined') {
			window.addEventListener('moveMapToLocation', (event) => {
				moveMapToLocation(event.detail);
			});
			window.addEventListener('cancelTempMarker', () => {
				cancelTempMarker();
			});
		}
	});

	onDestroy(() => {
		if (markers) {
			markers.forEach(marker => marker.setMap(null));
		}
		if (destinationMarker) {
			destinationMarker.setMap(null);
		}
		if (tempMarker) {
			tempMarker.setMap(null);
		}
		if (longPressTimer) {
			clearTimeout(longPressTimer);
		}
		
		// 이벤트 리스너 정리
		if (typeof window !== 'undefined') {
			window.removeEventListener('moveMapToLocation', moveMapToLocation);
			window.removeEventListener('cancelTempMarker', cancelTempMarker);
		}
	});

	// 참여자 또는 목적지 변경 시 마커 업데이트
	$: if (map && (participants || destination)) {
		updateMarkers();
	}
</script>

<div 
	bind:this={mapContainer} 
	class="w-full h-full bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center"
>
	<div class="text-slate-500 dark:text-slate-400">
		지도를 로드하는 중...
	</div>
</div>

<style>
	/* 카카오맵 스타일 오버라이드 */
	:global(.kakao-map) {
		border-radius: 0.5rem;
	}
</style>