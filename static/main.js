"use strict";

function parseQuery() {
	var query = {},
		a = document.location.search.substring(1).split('&');
	for (var i in a) {
		var b = a[i].split('=');
		query[decodeURIComponent(b[0])] = decodeURIComponent(b[1]);
	}

	return query;
}

function ErrorObject() {
	this.hasError = ko.observable(false);
	this.errorMessage = ko.observable();
};

ErrorObject.prototype.setError = function(message) {
	this.hasError(true);
	this.errorMessage(message);
};

ErrorObject.prototype.setValid = function() {
	this.hasError(false);
	this.errorMessage('');
};

function MediaItem(mediaObject) {
	this.ownerId = mediaObject["owner_id"];
	this.artist = mediaObject["artist"];
	this.title = mediaObject["title"];
	this.id = mediaObject["id"];
	this.duration = mediaObject["duration"];

	var _this = this;

	this.trackName = ko.computed(function() {
		return _this.artist + ' - ' + _this.title;
	});

	this.time = ko.computed(function() {
		var str = (_this.duration / 60) + "";
		var minutes = parseInt(str.substring(0, str.indexOf('.'))),
			seconds = _this.duration - (minutes * 60);

		if (isNaN(minutes) && isNaN(seconds)) {
			minutes = parseInt(str);
			seconds = '00';
		}

		if (seconds < 10) {
			seconds = "0" + seconds;
		}

		return minutes + ':' + seconds;
	});
}

function Field(value) {
	var self = this;
	this.originalValue = value;
	this.value = ko.observable(value);
	this.hasChanges = ko.computed(function() {
		return self.value() != self.originalValue;
	});
	this.error = new ErrorObject;
};

function async(array, callback, waitSeconds) {
	var results = [],
		totalItems = array.length,
		current = 0;

	var next = function(result) {
		current += 1;
		results.push(result);

		if (results.length < totalItems) {
			Timer(function(){
				callback(array[current], next, current);
			}, waitSeconds);
		}
	};

	if (results.length < totalItems) {
		Timer(function() {
			callback(array[current], next, current);
		}, waitSeconds);
	}

	return results;
}

function Timer(callback, seconds) {
	if (typeof callback !== 'function') return;
	
	seconds = seconds === undefined ? 0 : seconds;
	if (seconds === 0) {
		callback();
		return;
	}
	
	var current = 1;
	var interval = setInterval(function(){
		if (current == seconds) {
			clearInterval(interval);
			callback();
		}
		current += 1;
	}, 1000);
}

function Model(modal) {
	var self = this;
	var TYPE_WALL = 1;
	
	this.modal = modal;
	
	this.url = new Field();
	this.type = TYPE_WALL;
	this.albumName = ko.observable('');

	this.progress = {
		show: function(){
			self.modal.modal('show')
		},
		hide: function(callback, timeout){
			Timer(function(){
				if (typeof callback === 'function') callback();
				self.progress.message('');
				self.modal.modal('hide');
			}, timeout);
		},
		
		message: ko.observable()
	};

	this.setProgress = function(message) {
		self.progress.message(message);
		self.progress.show();
	};

	this.getPattern = function() {
		switch (this.type) {
			case TYPE_WALL:
				return /wall([\d-]+)_(\d+)/;
				break;
			default:
				throw new TypeError('Unknown type');
		}
	}.bind(this);

	this.clear = function() {
		this.url.value('');
		this.url.error.setValid();
	};

	this.mediaItems = ko.observableArray([]);

	this.clearItems = function() {
		self.mediaItems.removeAll();
	};

	this.processUrl = function() {
		ga('send', 'event', 'button', 'click', 'process');
		self.setProgress("Пожалуйста, подождите...");
		var pattern = this.getPattern(),
			url = self.url.value(),
			matches, gid, postId, attachments;

		if (pattern.test(url)) {
			matches = url.match(pattern);
			gid = parseInt(matches[1]);
			postId = parseInt(matches[2]);

			VK.api('wall.getById', {
				posts: gid + '_' + postId,
				test_mode: 1
			}, function(res) {
				var response = res.response,
					mediaItems = [];
				if (response.length === 0) {
					self.progress.message('Произошла ошибка. Скорее всего пост был удален');
					self.progress.hide(function(){
						self.clear();
					});
				} else {
					response = response[0];
					if (response.hasOwnProperty('copy_history') && response["copy_history"].length > 0) {
						response = response["copy_history"][0];
					}

					if (response.hasOwnProperty('attachments')) {
						response = response["attachments"];
					} else {
						self.progress.message('Произошла ошибка. Скорее всего пост был удален');
						self.progress.hide(function(){
							self.clear();
						});
						return;
					}
					var len = response.length;
					for (var i = 0; i < len; i += 1) {
						var object = response[i];
						if (object.type === 'audio') {
							self.mediaItems.push(new MediaItem(object["audio"] || {}))
						}
					}
					self.progress.hide(function(){}, 0);
				}
			});
		} else {
			self.progress.message('Неверный формат ссылки. Скопируйте ссылку с постом и вставте в поле для ввода.');
			self.progress.hide(function(){
				self.clear();
			});
		}
	};

	var _addTracks = function(callback) {
		
		var total = self.mediaItems().length;
		if (total == 0) return;
		self.setProgress('Пожалуйста, подождите...');
		var aids = async(self.mediaItems().reverse(), function(mediaItem, next, current) {
			self.progress.message('Добавляю: ' + (current + 1) + " из " + total);
			VK.api('audio.add', {
				owner_id: mediaItem.ownerId,
				audio_id: mediaItem.id,
				test_mode: 1
			}, function(res) {
				next(res.response);
			});
		}, 1);
		
		var t = setInterval(function(){
			if (total == aids.length) {
				clearInterval(t);
				callback(aids)
			}
		}, 200);
	};

	this.addTracks = function() {
		ga('send', 'event', 'button', 'click', 'add tracks');
		var album = this.albumName(),
			albumId = 0
			;
			
		_addTracks(function(aids){
			if (album.length > 0) {

				self.progress.message('Создаю альбом "' + album + '"');
				VK.api('audio.addAlbum', {
					title: album,
					test_mode: 1
				}, function(res) {
					var albumId = res.response.album_id;
					self.progress.message('Перемещаю треки в альбом');
			
					Timer(function(){
						VK.api('audio.moveToAlbum', {
							album_id: albumId,
							audio_ids: aids.join(','),
							test_mode: 1
						}, function(){
							self.progress.message('Успешно добавлено!');
							self.progress.hide(function(){
								self.clear();
								self.clearItems();
							}, 2);
						});
					}, 1);
				});
		
			} else {
				self.progress.message('Успешно добавлено!');
				self.progress.hide(function(){
					self.clear();
					self.clearItems();
				}, 2);
			}
				
		});
	}.bind(this);


}
